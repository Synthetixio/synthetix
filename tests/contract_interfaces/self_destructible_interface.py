from tests.contract_interfaces.owned_interface import OwnedInterface
from utils.deployutils import mine_tx


class SelfDestructibleInterface(OwnedInterface):
    def __init__(self, contract):
        OwnedInterface.__init__(self, contract)
        self.contract = contract
        self.owner = lambda: self.contract.functions.owner().call()
        self.nominateOwner = lambda sender, newOwner: mine_tx(
            self.contract.functions.nominateOwner(newOwner).transact({'from': sender}))
        self.acceptOwnership = lambda sender: mine_tx(
            self.contract.functions.acceptOwnership().transact({'from': sender}))

        self.initiationTime = lambda: self.contract.functions.initiationTime().call()
        self.selfDestructBeneficiary = lambda: self.contract.functions.selfDestructBeneficiary().call()

        self.setBeneficiary = lambda sender, beneficiary: mine_tx(
            self.contract.functions.setBeneficiary(beneficiary).transact({'from': sender}))
        self.initiateSelfDestruct = lambda sender: mine_tx(
            self.contract.functions.initiateSelfDestruct().transact({'from': sender}))
        self.terminateSelfDestruct = lambda sender: mine_tx(
            self.contract.functions.terminateSelfDestruct().transact({'from': sender}))
        self.selfDestruct = lambda sender: mine_tx(
            self.contract.functions.selfDestruct().transact({'from': sender}))
