from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs, UNIT, MASTER

# Source files to compile from
SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol", "contracts/HavvenEscrow.sol"]


def deploy_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

    # Deploy contracts
    havven_contract, hvn_txr = attempt_deploy(compiled, 'Havven',
                                              MASTER, [MASTER])
    nomin_contract, nom_txr = attempt_deploy(compiled, 'EtherNomin',
                                             MASTER,
                                             [havven_contract.address, MASTER, MASTER,
                                              1000 * UNIT, MASTER])
    court_contract, court_txr = attempt_deploy(compiled, 'Court',
                                               MASTER,
                                               [havven_contract.address, nomin_contract.address,
                                                MASTER])
    escrow_contract, escrow_txr = attempt_deploy(compiled, 'HavvenEscrow',
                                                 MASTER,
                                                 [MASTER, havven_contract.address, nomin_contract.address])

    # Hook up each of those contracts to each other
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")
    return havven_contract, nomin_contract, court_contract, hvn_txr, nom_txr, court_txr


if __name__ == "__main__":
    deploy_havven()
