
from web3 import Web3, HTTPProvider
from solc import compile_files
from utils.generalutils import TERMCOLORS
from deploy_settings import MASTER_ADDRESS, MASTER_KEY
# deploy_settings is a file that contains two strings, or however you want to decompile your private key


# Source files to compile from
SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/Nomin.sol",
                    "contracts/HavvenEscrow.sol", "contracts/ExternStateFeeToken.sol",
                    "contracts/DestructibleExternStateToken.sol", "contracts/Proxy.sol"]


BLOCKCHAIN_ADDRESS = "http://localhost:8545"
W3 = Web3(HTTPProvider(BLOCKCHAIN_ADDRESS))
POLLING_INTERVAL = 0.1
STATUS_ALIGN_SPACING = 6

# The number representing 1 in our contracts.
UNIT = 10**18
ZERO_ADDRESS = "0x" + "0" * 40


def attempt(function, func_args, init_string, func_kwargs=None, print_status=True, print_exception=True):
    if func_kwargs is None:
        func_kwargs = {}

    if print_status:
        print(init_string, end="", flush=True)

    pad = (STATUS_ALIGN_SPACING - len(init_string)) % STATUS_ALIGN_SPACING
    reset = TERMCOLORS.RESET
    try:
        result = function(*func_args, **func_kwargs)
        if print_status:
            print(f"{TERMCOLORS.GREEN}{' '*pad}Done!{reset}")
        return result
    except Exception as e:
        if print_status:
            print(f"{TERMCOLORS.RED}{' '*pad}Failed.{reset}")
        if print_exception:
            print(f"{TERMCOLORS.YELLOW}{TERMCOLORS.BOLD}ERROR:{reset} {TERMCOLORS.BOLD}{e}{reset}")
        return None


def sign_and_mine_txs(from_acc, key, txs):
    receipts = []
    for item in txs:
        print("Sending transaction")
        tx = item.buildTransaction({
            'from': from_acc,
            'gasPrice': W3.toWei('5', 'gwei'),
            'nonce': W3.eth.getTransactionCount(from_acc, "pending")
        })
        tx['gas'] = W3.eth.estimateGas(tx)
        signed = W3.eth.account.signTransaction(tx, key)
        txh = W3.eth.sendRawTransaction(signed.rawTransaction)
        print("Transaction hash:", txh)
        txn_receipt = W3.eth.waitForTransactionReceipt(txh)
        print("Transaction accepted")
        receipts.append(txn_receipt)
    return receipts


def compile_contracts(files, remappings=None):
    if remappings is None:
        remappings = []
    contract_interfaces = {}
    compiled = compile_files(files, import_remappings=remappings, optimize=True)
    for key in compiled:
        name = key.split(':')[-1]
        contract_interfaces[name] = compiled[key]
    return contract_interfaces


def attempt_deploy_signed(compiled_sol, contract_name, from_acc, key, constructor_args=None, gas=6000000):
    if constructor_args is None:
        constructor_args = []
    print("Deploying", contract_name)
    contract_interface = compiled_sol[contract_name]
    contract = W3.eth.contract(abi=contract_interface['abi'], bytecode=contract_interface['bin'])
    const_f = contract.constructor(*constructor_args)
    tx = const_f.buildTransaction({'from': from_acc, 'nonce': W3.eth.getTransactionCount(from_acc), 'gas': gas})
    tx['gasPrice'] = W3.toWei('5', 'gwei')
    signed = W3.eth.account.signTransaction(tx, key)
    txh = W3.eth.sendRawTransaction(signed.rawTransaction)
    txn_receipt = W3.eth.waitForTransactionReceipt(txh)
    address = txn_receipt.contractAddress
    print("Deployed to", address)
    contract.address = address
    return contract, txn_receipt


def deploy_havven(print_addresses=False):
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")
    #
    # # Deploy contracts
    # havven_proxy, h_prox_txr = attempt_deploy_signed(
    #     compiled, 'Proxy', MASTER_ADDRESS, MASTER_KEY, [MASTER_ADDRESS]
    # )
    #
    # nomin_proxy, h_prox_txr = attempt_deploy_signed(
    #     compiled, 'Proxy', MASTER_ADDRESS, MASTER_KEY, [MASTER_ADDRESS]
    # )
    #
    # havven_contract, hvn_txr = attempt_deploy_signed(
    #     compiled, 'Havven', MASTER_ADDRESS, MASTER_KEY,
    #     [havven_proxy.address, ZERO_ADDRESS, MASTER_ADDRESS, MASTER_ADDRESS, UNIT // 2]
    # )
    # nomin_contract, nom_txr = attempt_deploy_signed(
    #     compiled, 'Nomin', MASTER_ADDRESS, MASTER_KEY,
    #     [nomin_proxy.address, havven_contract.address, MASTER_ADDRESS, ZERO_ADDRESS]
    # )
    #
    # escrow_contract, escrow_txr = attempt_deploy_signed(
    #     compiled, 'HavvenEscrow', MASTER_ADDRESS, MASTER_KEY, [MASTER_ADDRESS, havven_contract.address]
    # )

    havven_proxy = W3.eth.contract(abi=compiled['Proxy']['abi'], address='0xEF630f892b69acb7Fd80a908f9ea4e84DE588e01')
    nomin_proxy = W3.eth.contract(abi=compiled['Proxy']['abi'], address='0xE77c61cD53301EfB6d9361fa91f5Fb6cd10d2253')
    havven_contract = W3.eth.contract(abi=compiled['Havven']['abi'], address='0xfC92FeBD60E6B4A28F959e5a833d0C16B46fe905')
    nomin_contract = W3.eth.contract(abi=compiled['Nomin']['abi'], address='0x95537CdC53Ef318b97A31BF66A620C2f760c962B')
    escrow_contract = W3.eth.contract(abi=compiled['HavvenEscrow']['abi'], address='0xA05Abe0Eba145E9A5b9B4D049772A3f92D45638e')

    # Hook up each of those contracts to each other
    sign_and_mine_txs(MASTER_ADDRESS, MASTER_KEY, [
        havven_proxy.functions.setTarget(havven_contract.address),
        nomin_proxy.functions.setTarget(nomin_contract.address),
        havven_contract.functions.setNomin(nomin_contract.address),
        nomin_contract.functions.setHavven(havven_contract.address),
        havven_contract.functions.setEscrow(escrow_contract.address)
    ])

    print("\nDeployment complete.\n")

    if print_addresses:
        print("Addresses")
        print("========\n")
        print(f"Havven Proxy: {havven_proxy.address}")
        print(f"Nomin Proxy:  {nomin_proxy.address}")
        print(f"Havven:       {havven_contract.address}")
        print(f"Nomin:        {nomin_contract.address}")
        print(f"Escrow:       {escrow_contract.address}")
        print()

    return havven_proxy, nomin_proxy, havven_contract, nomin_contract, escrow_contract


if __name__ == "__main__":
    deploy_havven(True)
    print(f"Owner: {MASTER_ADDRESS}")
