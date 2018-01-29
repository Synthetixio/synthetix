from utils.deployutils import attempt, compile_contracts, attempt_deploy, W3, mine_txs

# The number representing 1 in our contracts.
UNIT = 10**18

# Master test account
MASTER = W3.eth.accounts[0]

# Source files to compile from
SOLIDITY_SOURCES = ["contracts/Havven.sol", "contracts/EtherNomin.sol",
                    "contracts/Court.sol"]

def deploy_havven():
    print("Deployment initiated.\n")

    compiled = attempt(compile_contracts, [SOLIDITY_SOURCES], "Compiling contracts... ")

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
    txs = [havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
           havven_contract.functions.setCourt(court_contract.address).transact({'from': MASTER}),
           nomin_contract.functions.setCourt(court_contract.address).transact({'from': MASTER})]
    attempt(mine_txs, [txs], "Linking contracts... ")

    print("\nDeployment complete.\n")

if __name__ == "__main__":
    deploy_havven()
