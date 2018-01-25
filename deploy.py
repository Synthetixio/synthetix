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

# Web3 instance
W3 = Web3(HTTPProvider(BLOCKCHAIN_ADDRESS))

# Master test account
MASTER = W3.eth.accounts[0]

SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol"]

UNIT = 10**18

class TERMCOLORS:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def compile_contracts():
    files = SOLIDITY_SOURCES
    contract_interfaces = {}

    try:
        compiled = compile_files(files, optimize=True)
        for i in files:
            name = i.split("/")[1].split(".")[0]
            contract_interfaces[name] = compiled[i+":"+name]
    except:
        # fix for permission errors in py-solc
        # requires solcjs to be installed globally
        # > npm install -g solcjs
        import subprocess
        subprocess.call("./solcjs_compile.sh")
        for i in files:
            name = i.split("/")[1].split(".")[0]
            base_name = f"contracts/compiled/contracts_{name}_sol_{name}"
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
            print(TERMCOLORS.OKGREEN + "Done!" + TERMCOLORS.ENDC)
        return result
    except Exception as e:
        if print_status:
            print(TERMCOLORS.FAIL + "Failed." + TERMCOLORS.ENDC)
        if print_exception:
            print(e)
        return None

def mine_tx(tx_hash):
    tx_receipt = None
    while tx_receipt is None:
        tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
        time.sleep(POLLING_INTERVAL)
    return tx_receipt

def mine_txs(tx_hashes):
    hashes = list(tx_hashes)
    tx_receipts = []
    while hashes:
        to_remove = []
        for tx_hash in hashes:
            tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
            if tx_receipt is not None:
                tx_receipts.append(tx_receipt)
                to_remove.append(tx_hash)
        for item in to_remove:
            hashes.remove(item)
        time.sleep(POLLING_INTERVAL)
    return tx_receipts

def deploy_contract(compiled_sol, contract_name, deploy_account, constructor_args=[], gas=5000000):
    contract_interface = compiled_sol[contract_name]
    contract = W3.eth.contract(abi=contract_interface['abi'], bytecode=contract_interface['bin'])

    tx_hash = contract.deploy(transaction={'from': deploy_account, 'gas': gas},
                              args=constructor_args)

    tx_receipt = mine_tx(tx_hash)

    contract_address = tx_receipt['contractAddress']
    contract_instance = W3.eth.contract(contract_interface['abi'], contract_address)

    return contract_instance

def attempt_deploy(compiled_sol, contract_name, deploy_account, constructor_args):
    return attempt(deploy_contract,
                   [compiled_sol, contract_name, deploy_account, constructor_args],
                   f"Deploying {contract_name}... ")


#

compiled = compile_contracts()

# Deploy contracts
havven_contract = attempt_deploy(compiled, 'Havven',
                                 MASTER, [MASTER])
nomin_contract = attempt_deploy(compiled, 'EtherNomin',
                                MASTER,
                                [havven_contract.address, MASTER, MASTER,
                                1000*UNIT, MASTER])
court_contract = attempt_deploy(compiled, 'Court',
                                MASTER,
                                [havven_contract.address, nomin_contract.address,
                                 MASTER])

# Hook up each of those contracts to each other
txs = [havven_contract.transact({'from': MASTER}).setNomin(nomin_contract.address),
       havven_contract.transact({'from': MASTER}).setCourt(court_contract.address),
       nomin_contract.transact({'from': MASTER}).setCourt(court_contract.address)]
attempt(mine_txs, [txs], "Linking contracts... ")

# Test out state updates
"""
print(havven_contract.call().balanceOf(havven_contract.address))
print(havven_contract.call().balanceOf(MASTER))

print("Endowing master account with 1000 havvens...")
mine_tx(havven_contract.transact({'from': MASTER}).endow(MASTER, 1000*UNIT))

print(havven_contract.call().balanceOf(havven_contract.address))
print(havven_contract.call().balanceOf(account))
print(havven_contract.call().balanceOf(MASTER))
"""
