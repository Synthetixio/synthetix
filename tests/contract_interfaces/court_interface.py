from tests.contract_interfaces.safe_decimal_math_interface import SafeDecimalMathInterface
from tests.contract_interfaces.owned_interface import  OwnedInterface
from utils.deployutils import mine_tx


class CourtInterface(SafeDecimalMathInterface, OwnedInterface):
    def __init__(self, contract, name):
        SafeDecimalMathInterface.__init__(self, contract, name)
        OwnedInterface.__init__(self, contract, name)

        self.contract = contract
        self.contract_name = name

        # Public variables
        self.motionTarget = lambda index: self.contract.functions.motionTarget(index).call()
        self.targetMotionID = lambda address: self.contract.functions.targetMotionID(address).call()
        self.motionStartTime = lambda account: self.contract.functions.motionStartTime(account).call()
        self.votesFor = lambda account: self.contract.functions.votesFor(account).call()
        self.votesAgainst = lambda account: self.contract.functions.votesAgainst(account).call()
        self.vote = lambda account, motionID: self.contract.functions.vote(account, motionID).call()

         # Setters
        self.setMinStandingBalance = lambda sender, balance: mine_tx(
            self.contract.functions.setMinStandingBalance(balance).transact({'from': sender}), "setMinStandingBalance", self.contract_name)
        self.setVotingPeriod = lambda sender, duration: mine_tx(
            self.contract.functions.setVotingPeriod(duration).transact({'from': sender}), "setVotingPeriod", self.contract_name)
        self.setConfirmationPeriod = lambda sender, duration: mine_tx(
            self.contract.functions.setConfirmationPeriod(duration).transact({'from': sender}), "setConfirmationPeriod", self.contract_name)
        self.setRequiredParticipation = lambda sender, fraction: mine_tx(
            self.contract.functions.setRequiredParticipation(fraction).transact({'from': sender}), "setRequiredParticipation", self.contract_name)
        self.setRequiredMajority = lambda sender, fraction: mine_tx(
            self.contract.functions.setRequiredMajority(fraction).transact({'from': sender}), "setRequiredMajority", self.contract_name)

        # Views
        self.hasVoted = lambda sender, motionID: self.contract.functions.hasVoted(sender, motionID).call()
        self.motionVoting = lambda target: self.contract.functions.motionVoting(target).call()
        self.motionConfirming = lambda target: self.contract.functions.motionConfirming(target).call()
        self.motionWaiting = lambda target: self.contract.functions.motionWaiting(target).call()
        self.motionPasses = lambda target: self.contract.functions.motionPasses(target).call()

        # Mutators
        self.beginMotion = lambda sender, target: mine_tx(
            self.contract.functions.beginMotion(target).transact({'from': sender}), "beginMotion", self.contract_name)
        self.voteFor = lambda sender, target: mine_tx(
            self.contract.functions.voteFor(target).transact({'from': sender}), "voteFor", self.contract_name)
        self.voteAgainst = lambda sender, target: mine_tx(
            self.contract.functions.voteAgainst(target).transact({'from': sender}), "voteAgainst", self.contract_name)
        self.cancelVote = lambda sender, target: mine_tx(
            self.contract.functions.cancelVote(target).transact({'from': sender}), "cancelVote", self.contract_name)
        self.closeMotion = lambda sender, target: mine_tx(
            self.contract.functions.closeMotion(target).transact({'from': sender}), "closeMotion", self.contract_name)

        # Owner only
        self.approveMotion = lambda sender, target: mine_tx(
            self.contract.functions.approveMotion(target).transact({'from': sender}), "approveMotion", self.contract_name)
        self.vetoMotion = lambda sender, target: mine_tx(
            self.contract.functions.vetoMotion(target).transact({'from': sender}), "vetoMotion", self.contract_name)


class PublicCourtInterface(CourtInterface):
    def __init__(self, contract, name):
        CourtInterface.__init__(self, contract, name)
        self.contract = contract
        self.contract_name = name

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
            self.contract.functions.publicSetupVote(target).transact({'from': sender}), "setupVote", self.contract_name)

        self.setHavven = lambda sender, addr: mine_tx(
            self.contract.functions.setHavven(addr).transact({'from': sender}), "setHavven", self.contract_name)
        self.setNomin = lambda sender, addr: mine_tx(
            self.contract.functions.setNomin(addr).transact({'from': sender}), "setNomin", self.contract_name)


class FakeCourtInterface:
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.setNomin = lambda sender, new_nomin: mine_tx(
            self.contract.functions.setNomin(new_nomin).transact({'from': sender}), "setNomin", "FakeCourt")
        self.setConfirming = lambda sender, target, status: mine_tx(
            self.contract.functions.setConfirming(target, status).transact({'from': sender}), "setConfirming",
            "FakeCourt")
        self.setVotePasses = lambda sender, target, status: mine_tx(
            self.contract.functions.setVotePasses(target, status).transact({'from': sender}), "setVotePasses",
            "FakeCourt")
        self.setTargetMotionID = lambda sender, target, motionID: mine_tx(
            self.contract.functions.setTargetMotionID(target, motionID).transact({'from': sender}), "setTargetMotionID",
            "FakeCourt")
        self.confiscateBalance = lambda sender, target: mine_tx(
            self.contract.functions.confiscateBalance(target).transact({'from': sender}), "confiscateBalance",
            "FakeCourt")