from time import sleep
from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    attempt_deploy,
    take_snapshot, restore_snapshot
)
from utils.testutils import (
    HavvenTestCase,
    block_time
)
from tests.contract_interfaces.pausable_interface import PausableInterface

def setUpModule():
    print("Testing Pausable...")
    print("================")
    print()


def tearDownModule():
    print()
    print()


class TestPausable(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @classmethod
    def deployContracts(cls):
        sources = [
            "contracts/Pausable.sol",
            "tests/contracts/TestablePausable.sol"
        ]

        compiled, cls.event_maps = cls.compileAndMapEvents(sources)
        pausableContract, _ = attempt_deploy(compiled, 'TestablePausable', MASTER, [cls.contractOwner])
        return pausableContract

    @classmethod
    def setUpClass(cls):
        addresses = fresh_accounts(6)
        cls.participantAddresses = addresses[0:]
        cls.contractOwner = MASTER
        cls.pausableContract = cls.deployContracts()
        cls.pausable = PausableInterface(cls.pausableContract, "TestablePausable")
        cls.pausableEventDict = cls.event_maps['TestablePausable']


    def test_constructor(self):
        self.assertEqual(self.pausable.owner(), self.contractOwner)
        self.assertEqual(self.pausable.lastPauseTime(), 0)
        self.assertEqual(self.pausable.paused(), False)

    def test_setPauseToggles(self):
        initialPausedState = self.pausable.paused()
        self.pausable.setPaused(self.contractOwner, not initialPausedState)
        currentlyPausedState = self.pausable.paused()
        self.assertEqual(not initialPausedState, currentlyPausedState)
    
    def test_setPauseIgnoresSame(self):
        initialPausedState = self.pausable.paused()
        initialLastPauseTime = self.pausable.lastPauseTime()

        # Try to set it to the same value
        txr = self.pausable.setPaused(self.contractOwner, initialPausedState)

        # Ensure no event was emitted and the state is the same.
        self.assertEqual(len(txr.logs), 0)
        currentlyPausedState = self.pausable.paused()
        self.assertEqual(initialPausedState, currentlyPausedState)
        currentLastPausedTime = self.pausable.lastPauseTime()
        self.assertEqual(initialLastPauseTime, currentLastPausedTime)

    def test_cannotSetPausedIfUnauthorised(self):
        unauthorisedAddress = fresh_accounts(1)[0]
        initialPausedState = self.pausable.paused()
        self.assertReverts(self.pausable.setPaused, unauthorisedAddress, not initialPausedState)

    def test_setPauseUpdatesTime(self):
        self.pausable.setPaused(self.contractOwner, True)
        initialLastPauseTime = self.pausable.lastPauseTime()
        sleep(1) # Wait one second so the lastPauseTime is different to now
        self.pausable.setPaused(self.contractOwner, False)
        afterFalseLastPausedTime = self.pausable.lastPauseTime()
        self.assertEqual(initialLastPauseTime, afterFalseLastPausedTime)
        txr = self.pausable.setPaused(self.contractOwner, True)
        finalLastPausedTime = self.pausable.lastPauseTime()
        self.assertEqual(finalLastPausedTime, block_time(txr.blockNumber))
        self.assertNotEqual(finalLastPausedTime, afterFalseLastPausedTime)

    def test_pausingEmitsEvent(self):
        initialPausedState = self.pausable.paused()
        newState = not initialPausedState
        txn1 = self.pausable.setPaused(self.contractOwner, newState)
        self.assertEventEquals(
            self.pausableEventDict, txn1.logs[0], 'PauseChanged',
            fields={'isPaused': newState},
            location=self.pausableContract.address
        )
        finalState = not newState
        txn2 = self.pausable.setPaused(self.contractOwner, finalState)
        self.assertEventEquals(
            self.pausableEventDict, txn2.logs[0], 'PauseChanged',
            fields={'isPaused': finalState},
            location=self.pausableContract.address
        )

    def test_notPausedModifier(self):
        originalValue = self.pausable.getSomeValue()
        newValue = originalValue + 123
        self.pausable.setSomeValue(self.contractOwner, newValue)
        updatedValue = self.pausable.getSomeValue()
        self.assertEqual(newValue, updatedValue)

        # Pause and ensure it doesn't work
        self.pausable.setPaused(self.contractOwner, True)
        self.assertReverts(self.pausable.setSomeValue, self.contractOwner, originalValue)
        updatedValue = self.pausable.getSomeValue()
        self.assertNotEqual(originalValue, updatedValue)

        # Unpause and ensure it works again
        self.pausable.setPaused(self.contractOwner, False)
        newValue = originalValue + 1234
        self.pausable.setSomeValue(self.contractOwner, newValue)
        updatedValue = self.pausable.getSomeValue()
        self.assertEqual(newValue, updatedValue)
