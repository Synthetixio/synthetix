import time

from web3 import Web3, HTTPProvider
from solc import compile_files
from utils.generalutils import to_seconds, TERMCOLORS

BLOCKCHAIN_ADDRESS = "http://localhost:8545"
W3 = Web3(HTTPProvider(BLOCKCHAIN_ADDRESS))
POLLING_INTERVAL = 0.1
STATUS_ALIGN_SPACING = 6

# The number representing 1 in our contracts.
UNIT = 10**18

# The number of wei per ether.
ETHER = 10**18

# Master test account
MASTER = W3.eth.accounts[0]

# Dummy account for certain tests (i.e. changing ownership)
DUMMY = W3.eth.accounts[1]

# what account was last accessed, assumes ganache-cli was started with enough actors
last_accessed_account = 1


def fresh_account():
    """Return first account after DUMMY"""
    try:
        global last_accessed_account
        last_accessed_account += 1
        return W3.eth.accounts[last_accessed_account]
    except KeyError:
        raise Exception("""W3.eth.accounts doesn't contain enough accounts,
        restart ganache with more accounts (i.e. ganache-cli -a 500)""")


def fresh_accounts(num_accs):
    accs = W3.eth.accounts[last_accessed_account + 1:]
    if len(accs) < num_accs:
        raise Exception("""W3.eth.accounts doesn't contain enough accounts,
                        restart ganache with more accounts (i.e. ganache-cli -a 500)""")
    return accs[:num_accs]


def attempt(function, func_args, init_string, print_status=True, print_exception=True):
    if print_status:
        print(init_string, end="", flush=True)

    pad = (STATUS_ALIGN_SPACING - len(init_string)) % STATUS_ALIGN_SPACING
    reset = TERMCOLORS.RESET
    try:
        result = function(*func_args)
        if print_status:
            print(f"{TERMCOLORS.GREEN}{' '*pad}Done!{reset}")
        return result
    except Exception as e:
        if print_status:
            print(f"{TERMCOLORS.RED}{' '*pad}Failed.{reset}")
        if print_exception:
            print(f"{TERMCOLORS.YELLOW}{TERMCOLORS.BOLD}ERROR:{reset} {TERMCOLORS.BOLD}{e}{reset}")
        return None


def compile_contracts(files, remappings=None):
    if remappings is None:
        remappings = []
    contract_interfaces = {}
    compiled = compile_files(files, import_remappings=remappings, optimize=True)
    for key in compiled:
        name = key.split(':')[-1]
        contract_interfaces[name] = compiled[key]
    return contract_interfaces


def force_mine_block():
    W3.providers[0].make_request("evm_mine", [])


time_fast_forwarded = 0


def fast_forward(seconds=0, minutes=0, hours=0, days=0, weeks=0):
    global time_fast_forwarded
    total_time = to_seconds(seconds, minutes, hours, days, weeks)
    time_fast_forwarded += total_time
    W3.providers[0].make_request("evm_increaseTime", [total_time])
    force_mine_block()


def take_snapshot():
    x = W3.providers[0].make_request("evm_snapshot", [])
    force_mine_block()
    return x


def restore_snapshot(snapshot):
    W3.providers[0].make_request("evm_revert", [snapshot['result']])
    force_mine_block()


def mine_tx(tx_hash):
    tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
    while tx_receipt is None:
        time.sleep(POLLING_INTERVAL)
        tx_receipt = W3.eth.getTransactionReceipt(tx_hash)
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


def deploy_contract(compiled_sol, contract_name, deploy_account, constructor_args=None, gas=6000000):
    if constructor_args is None:
        constructor_args = []
    contract_interface = compiled_sol[contract_name]
    contract = W3.eth.contract(abi=contract_interface['abi'], bytecode=contract_interface['bin'])
    tx_hash = contract.deploy(
        transaction={'from': deploy_account, 'gas': gas}, args=constructor_args
    )
    tx_receipt = mine_tx(tx_hash)
    contract_instance = W3.eth.contract(address=tx_receipt['contractAddress'], abi=contract_interface['abi'])
    return contract_instance, tx_receipt


def attempt_deploy(compiled_sol, contract_name, deploy_account, constructor_args, print_status=True,
                   print_exception=True):
    return attempt(
        deploy_contract, [compiled_sol, contract_name, deploy_account, constructor_args],
        f"Deploying {contract_name}... ", print_status=print_status, print_exception=print_exception
    )
