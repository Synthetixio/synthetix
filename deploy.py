from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, UNIT, MASTER
from utils.testutils import ZERO_ADDRESS

# Source files to compile from
SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol", "contracts/HavvenEscrow.sol",
                    "contracts/ERC20State.sol", "contracts/ERC20FeeState.sol",
                    "contracts/Proxy.sol"]

OWNER = MASTER
ORACLE = MASTER
LIQUIDATION_BENEFICIARY = MASTER
INITIAL_ETH_PRICE = 1000 * UNIT


def deploy_havven(print_addresses=False):
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'Havven',
                                              MASTER, [ZERO_ADDRESS, OWNER])
    nomin_contract, nom_txr = attempt_deploy(compiled, 'EtherNomin',
                                             MASTER,
                                             [havven_contract.address, ORACLE,
                                              LIQUIDATION_BENEFICIARY,
                                              INITIAL_ETH_PRICE, OWNER, ZERO_ADDRESS])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                OWNER])
    escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                 MASTER,
                                                 [OWNER, havven_contract.address])

    # Wrap contracts with proxies
    havven_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                     MASTER, [havven_contract.address, MASTER])

    nomin_proxy, _ = attempt_deploy(compiled, 'Proxy',
                                    MASTER, [nomin_contract.address, MASTER])
    txs = [havven_contract.functions.setProxy(havven_proxy.address).transact({'from': MASTER}),
           nomin_contract.functions.setProxy(nomin_proxy.address).transact({'from': MASTER})]

    attempt(mine_txs, [txs], "Deploying Proxies...")

    proxy_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['Havven']['abi'])
    proxy_nomin = W3.eth.contract(address=nomin_proxy.address, abi=compiled['EtherNomin']['abi'])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           havven_contract.functions.setEscrow(escrow_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")

    if print_addresses:
        print("Addresses")
        print("========\n")
        print(f"Havven: {havven_contract.address}")
        print(f"Havven Proxy: {havven_proxy.address}")
        print(f"Nomin:  {nomin_contract.address}")
        print(f"Nomin Proxy: {nomin_proxy.address}")
        print(f"Court:  {court_contract.address}")
        print(f"Escrow: {escrow_contract.address}")
        print()

    return havven_contract, nomin_contract, havven_proxy, nomin_proxy, court_contract, escrow_contract, hvn_txr, nom_txr, court_txr


if __name__ == "__main__":
    deploy_havven(True)
    print(f"Owner: {OWNER}")
    print(f"Oracle: {ORACLE}")
    print(f"Liquidation beneficiary: {LIQUIDATION_BENEFICIARY}")
