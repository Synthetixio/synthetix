import json
import web3

from web3 import Web3, HTTPProvider, TestRPCProvider
from solc import compile_files
from web3.contract import ConciseContract

import time

POLLING_INTERVAL = 2
# Our private chain
#BLOCKCHAIN_ADDRESS = "http://13.211.41.240:8545"
# Ganache
BLOCKCHAIN_ADDRESS = "http://localhost:8545"

SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol"]

def compile_contracts():
    files = SOLIDITY_SOURCES
    contract_interfaces = {}

    try:
        compiled = compile_files(files, optimize=True)
        for i in files:
            name = i.split("/")[1].split(".")[0]
            contract_interfaces[name] = compiled[i+":"+name]
    except PermissionError:
        # fix for permission errors in py-solc
        # requires solcjs to be installed globally
        # > npm install -g solcjs
        import subprocess
        subprocess.call("solcjs_compile.sh")

        for i in files:
            name = i.split("/")[1].split(".")[0]
            base_name = f"contracts/compiled/{name}_sol_{name}"
            contract_interfaces[name] = {
                "abi": json.loads(open(base_name+".abi", 'r').read()),
                "bin": open(base_name+".bin", 'rb').read()
            }
    
    return contract_interfaces


def attempt(function, func_args, init_string, print_status=True, print_exception=False):
    if print_status:
        print(init_string, end="", flush=True)

    try:
        result = function(*func_args)
        if print_status:
            print("Done!")
        return result
    except Exception as e:
        if print_status:
            print("Failed.")
        if print_exception:
            print(e)
        return None

def mine_tx(w3, tx_hash):
    tx_receipt = None
    while tx_receipt is None:
        tx_receipt = w3.eth.getTransactionReceipt(tx_hash)
        time.sleep(POLLING_INTERVAL)
    return tx_receipt

def mine_txs(w3, tx_hashes):
    hashes = list(tx_hashes)
    tx_receipts = []
    while hashes:
        to_remove = []
        for tx_hash in hashes:
            tx_receipt = w3.eth.getTransactionReceipt(tx_hash)
            if tx_receipt is not None:
                tx_receipts.append(tx_receipt)
                to_remove.append(tx_hash)
        for item in to_remove:
            hashes.remove(item)
        time.sleep(POLLING_INTERVAL)
    return tx_receipts

def deploy_contract(w3, compiled_sol, contract_name, deploy_account, constructor_args=[], gas=3000000):
    contract_interface = compiled_sol[contract_name]
    contract = w3.eth.contract(abi=contract_interface['abi'], bytecode=contract_interface['bin'])

    tx_hash = contract.deploy(transaction={'from': deploy_account, 'gas': gas},
                              args=constructor_args)

    tx_receipt = mine_tx(w3, tx_hash)

    contract_address = tx_receipt['contractAddress']
    contract_instance = w3.eth.contract(contract_interface['abi'], contract_address)

    return contract_instance

def attempt_deploy(w3, compiled_sol, contract_name, deploy_account, constructor_args):
    return attempt(deploy_contract,
                   [w3, compiled_sol, contract_name, deploy_account, constructor_args],
                   f"Deploying {contract_name}... ")

compiled = compile_contracts()

# Web3 instance
w3_instance = Web3(HTTPProvider(BLOCKCHAIN_ADDRESS))

# Master test account
account = w3_instance.eth.accounts[0]

# Deploy contracts
havven_contract = attempt_deploy(w3_instance, compiled,
                                 'Havven',
                                 account, [account])
nomin_contract = attempt_deploy(w3_instance, compiled,
                                'EtherNomin',
                                account,
                                [havven_contract.address, account, account,
                                10**21, account])
court_contract = attempt_deploy(w3_instance, compiled,
                                'Court',
                                account,
                                [havven_contract.address, nomin_contract.address,
                                 account])

# Hook up each of those contracts to each other
txs = [havven_contract.transact({'from': account}).setNomin(nomin_contract.address),
       havven_contract.transact({'from': account}).setCourt(court_contract.address),
       nomin_contract.transact({'from': account}).setCourt(court_contract.address)]
attempt(mine_txs, [w3_instance, txs], "Linking contracts... ", print_exception=True)

# Test out state updates
print(havven_contract.call().balanceOf(havven_contract.address))
print(havven_contract.call().balanceOf(account))

mine_tx(w3_instance, havven_contract.transact({'from':account}).endow(account, 10**21))

print(havven_contract.call().balanceOf(havven_contract.address))
print(havven_contract.call().balanceOf(account))