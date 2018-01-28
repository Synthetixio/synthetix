import time

from web3 import Web3, HTTPProvider
from solc import compile_files

POLLING_INTERVAL = 2
STATUS_ALIGN_SPACING = 6

# Our private chain
#BLOCKCHAIN_ADDRESS = "http://13.211.41.240:8545"
# Ganache
BLOCKCHAIN_ADDRESS = "http://localhost:8545"

# Web3 instance
W3 = Web3(HTTPProvider(BLOCKCHAIN_ADDRESS))

class TERMCOLORS:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def attempt(function, func_args, init_string, print_status=True, print_exception=True):
    if print_status:
        print(init_string, end="", flush=True)

    pad = (STATUS_ALIGN_SPACING - len(init_string)) % STATUS_ALIGN_SPACING

    try:
        result = function(*func_args)
        if print_status:
            print(TERMCOLORS.OKGREEN + " "*pad + "Done!" + TERMCOLORS.ENDC)
        return result
    except Exception as e:
        if print_status:
            print(TERMCOLORS.FAIL + " "*pad + "Failed." + TERMCOLORS.ENDC)
        if print_exception:
            print(f"{TERMCOLORS.WARNING}{TERMCOLORS.BOLD}ERROR:{TERMCOLORS.ENDC} {TERMCOLORS.BOLD}{e}{TERMCOLORS.ENDC}")
        return None


def compile_contracts(files, remappings=[]):
    contract_interfaces = {}
    compiled = compile_files(files, import_remappings=remappings)
    for key in compiled:
        name = key.split(':')[-1]
        contract_interfaces[name] = compiled[key]
    return contract_interfaces

def mine_tx(tx_hash):
    tx_receipt = None
    while tx_receipt is None:
        tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
        time.sleep(POLLING_INTERVAL)
    return tx_receipt

def mine_txs(tx_hashes):
    hashes = list(tx_hashes)
    tx_receipts = {}
    while hashes:
        to_remove = []
        for tx_hash in hashes:
            tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
            if tx_receipt is not None:
                tx_receipts[tx_hash] = tx_receipt
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
    contract_instance = W3.eth.contract(address=tx_receipt['contractAddress'], abi=contract_interface['abi'])
    return contract_instance

def attempt_deploy(compiled_sol, contract_name, deploy_account, constructor_args, print_status=True, print_exception=True):
    return attempt(deploy_contract,
                   [compiled_sol, contract_name, deploy_account, constructor_args],
                   f"Deploying {contract_name}... ",
                   print_status=print_status, print_exception=print_exception)


