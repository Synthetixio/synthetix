from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface
from tests.contract_interfaces.owned_interface import  OwnedInterface
from utils.deployutils import mine_tx


class CourtInterface(SafeDecimalMathInterface, OwnedInterface):
    def __init__(self, contract):
        SafeDecimalMathInterface.__init__(self, contract)
        OwnedInterface.__init__(self, contract)

        self.contract = contract

        # Public variables
        self.motionTarget = lambda index: self.contract.functions.motionTarget(index).call()
        self.targetMotionID = lambda address: self.contract.functions.targetMotionID(address).call()
        self.motionStartTime = lambda account: self.contract.functions.motionStartTime(account).call()
        self.votesFor = lambda account: self.contract.functions.votesFor(account).call()
        self.votesAgainst = lambda account: self.contract.functions.votesAgainst(account).call()
        self.vote = lambda account, motionID: self.contract.functions.vote(account, motionID).call()

        # Inherited setters
        self.nominateOwner = lambda sender, address: mine_tx(
            self.contract.functions.nominateOwner(address).transact({'from': sender}))
        self.acceptOwnership = lambda sender: mine_tx(
            self.contract.functions.acceptOwnership().transact({'from': sender}))

        # Setters
        self.setMinStandingBalance = lambda sender, balance: mine_tx(
            self.contract.functions.setMinStandingBalance(balance).transact({'from': sender}))
        self.setVotingPeriod = lambda sender, duration: mine_tx(
            self.contract.functions.setVotingPeriod(duration).transact({'from': sender}))
        self.setConfirmationPeriod = lambda sender, duration: mine_tx(
            self.contract.functions.setConfirmationPeriod(duration).transact({'from': sender}))
        self.setRequiredParticipation = lambda sender, fraction: mine_tx(
            self.contract.functions.setRequiredParticipation(fraction).transact({'from': sender}))
        self.setRequiredMajority = lambda sender, fraction: mine_tx(
            self.contract.functions.setRequiredMajority(fraction).transact({'from': sender}))

        # Views
        self.hasVoted = lambda sender, motionID: self.contract.functions.hasVoted(sender, motionID).call()
        self.motionVoting = lambda target: self.contract.functions.motionVoting(target).call()
        self.motionConfirming = lambda target: self.contract.functions.motionConfirming(target).call()
        self.motionWaiting = lambda target: self.contract.functions.motionWaiting(target).call()
        self.motionPasses = lambda target: self.contract.functions.motionPasses(target).call()

        # Mutators
        self.beginMotion = lambda sender, target: mine_tx(
            self.contract.functions.beginMotion(target).transact({'from': sender}))
        self.voteFor = lambda sender, target: mine_tx(
            self.contract.functions.voteFor(target).transact({'from': sender}))
        self.voteAgainst = lambda sender, target: mine_tx(
            self.contract.functions.voteAgainst(target).transact({'from': sender}))
        self.cancelVote = lambda sender, target: mine_tx(
            self.contract.functions.cancelVote(target).transact({'from': sender}))
        self.closeMotion = lambda sender, target: mine_tx(
            self.contract.functions.closeMotion(target).transact({'from': sender}))

        # Owner only
        self.approveMotion = lambda sender, target: mine_tx(
            self.contract.functions.approveMotion(target).transact({'from': sender}))
        self.vetoMotion = lambda sender, target: mine_tx(
            self.contract.functions.vetoMotion(target).transact({'from': sender}))


class PublicCourtInterface(CourtInterface):
    def __init__(self, contract):
        CourtInterface.__init__(self, contract)
        self.contract = contract

        self.getHavven = lambda: self.contract.functions._havven().call()
        self.getNomin = lambda: self.contract.functions._nomin().call()
        self.minStandingBalance = lambda: self.contract.functions.minStandingBalance().call()
        self.votingPeriod = lambda: self.contract.functions.votingPeriod().call()
        self.MIN_VOTING_PERIOD = lambda: self.contract.functions._MIN_VOTING_PERIOD().call()
        self.MAX_VOTING_PERIOD = lambda: self.contract.functions._MAX_VOTING_PERIOD().call()
        self.confirmationPeriod = lambda: self.contract.functions.confirmationPeriod().call()
        self.MIN_CONFIRMATION_PERIOD = lambda: self.contract.functions._MIN_CONFIRMATION_PERIOD().call()
        self.MAX_CONFIRMATION_PERIOD = lambda: self.contract.functions._MAX_CONFIRMATION_PERIOD().call()
        self.requiredParticipation = lambda: self.contract.functions.requiredParticipation().call()
        self.MIN_REQUIRED_PARTICIPATION = lambda: self.contract.functions._MIN_REQUIRED_PARTICIPATION().call()
        self.requiredMajority = lambda: self.contract.functions.requiredMajority().call()
        self.MIN_REQUIRED_MAJORITY = lambda: self.contract.functions._MIN_REQUIRED_MAJORITY().call()
        self.voteWeight = lambda account, motionID: self.contract.functions._voteWeight(account, motionID).call()
        self.nextMotionID = lambda: self.contract.functions._nextMotionID().call()

        # Internal
        self.setupVote = lambda sender, target: mine_tx(
            self.contract.functions.publicSetupVote(target).transact({'from': sender}))
