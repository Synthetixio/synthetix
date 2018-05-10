from utils.deployutils import (
    W3, UNIT, MASTER, DUMMY,
    fresh_account, fresh_accounts,
    compile_contracts, attempt_deploy, mine_tx, mine_txs,
    take_snapshot, restore_snapshot, fast_forward
)
from utils.testutils import (
    HavvenTestCase, ZERO_ADDRESS,
    generate_topic_event_map, get_event_data_from_log
)
from tests.contract_interfaces.nomin_interface import PublicNominInterface
from tests.contract_interfaces.havven_interface import HavvenInterface

SOURCES = ["tests/contracts/PublicNomin.sol", "tests/contracts/FakeCourt.sol", "contracts/Havven.sol"]


def setUpModule():
    print("Testing Nomin...")


def tearDownModule():
    print()


class TestNomin(HavvenTestCase):
    def setUp(self):
        self.snapshot = take_snapshot()

    def tearDown(self):
        restore_snapshot(self.snapshot)

    @staticmethod
    def deployContracts():
        compiled = compile_contracts(SOURCES, remappings=['""=contracts'])

        nomin_abi = compiled['PublicNomin']['abi']
        nomin_event_dict = generate_topic_event_map(nomin_abi)

        havven_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        nomin_proxy, _ = attempt_deploy(compiled, 'Proxy', MASTER, [MASTER])
        proxied_havven = W3.eth.contract(address=havven_proxy.address, abi=compiled['Havven']['abi'])
        proxied_nomin = W3.eth.contract(address=nomin_proxy.address, abi=nomin_abi)

        nomin_contract, _ = attempt_deploy(
            compiled, 'PublicNomin', MASTER, [nomin_proxy.address, MASTER, MASTER, ZERO_ADDRESS]
        )

        havven_contract, _ = attempt_deploy(
            compiled, "Havven", MASTER, [havven_proxy.address, ZERO_ADDRESS, MASTER, MASTER]
        )

        fake_court, _ = attempt_deploy(compiled, 'FakeCourt', MASTER, [])

        mine_txs([
            havven_proxy.functions.setTarget(havven_contract.address).transact({'from': MASTER}),
            nomin_proxy.functions.setTarget(nomin_contract.address).transact({'from': MASTER}),
            havven_contract.functions.setNomin(nomin_contract.address).transact({'from': MASTER}),
            nomin_contract.functions.setCourt(fake_court.address).transact({'from': MASTER}),
            nomin_contract.functions.setHavven(havven_contract.address).transact({'from': MASTER})
        ])

        return havven_proxy, proxied_havven, nomin_proxy, proxied_nomin, nomin_contract, nomin_event_dict, havven_contract, fake_court

    @classmethod
    def setUpClass(cls):
        cls.havven_proxy, cls.proxied_havven, cls.nomin_proxy, cls.proxied_nomin, cls.nomin_contract, cls.nomin_event_dict, cls.havven_contract, cls.fake_court = cls.deployContracts()

        cls.nomin = PublicNominInterface(cls.nomin_contract)
        cls.havven = HavvenInterface(cls.havven_contract)

        cls.fake_court.setNomin = lambda sender, new_nomin: mine_tx(
            cls.fake_court.functions.setNomin(new_nomin).transact({'from': sender}))
        cls.fake_court.setConfirming = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setConfirming(target, status).transact({'from': sender}))
        cls.fake_court.setVotePasses = lambda sender, target, status: mine_tx(
            cls.fake_court.functions.setVotePasses(target, status).transact({'from': sender}))
        cls.fake_court.setTargetMotionID = lambda sender, target, motion_id: mine_tx(
            cls.fake_court.functions.setTargetMotionID(target, motion_id).transact({'from': sender}))
        cls.fake_court.confiscateBalance = lambda sender, target: mine_tx(
            cls.fake_court.functions.confiscateBalance(target).transact({'from': sender}))
        cls.fake_court.setNomin(MASTER, cls.nomin_contract.address)

        cls.nomin.setFeeAuthority(MASTER, cls.havven_contract.address)

    def test_constructor(self):
        # Nomin-specific members
        self.assertEqual(self.nomin.owner(), MASTER)
        self.assertTrue(self.nomin.frozen(self.nomin_contract.address))

        # ExternStateFeeToken members
        self.assertEqual(self.nomin.name(), "USD Nomins")
        self.assertEqual(self.nomin.symbol(), "nUSD")
        self.assertEqual(self.nomin.totalSupply(), 0)
        self.assertEqual(self.nomin.balanceOf(MASTER), 0)
        self.assertEqual(self.nomin.transferFeeRate(), 15 * UNIT // 10000)
        self.assertEqual(self.nomin.feeAuthority(), self.nomin.havven())
        self.assertEqual(self.nomin.decimals(), 18)

    def test_setOwner(self):
        pre_owner = self.nomin.owner()
        new_owner = DUMMY

        # Only the owner must be able to set the owner.
        self.assertReverts(self.nomin.nominateOwner, new_owner, new_owner)
        self.nomin.nominateOwner(pre_owner, new_owner)
        self.nomin.acceptOwnership(new_owner)
        self.assertEqual(self.nomin.owner(), new_owner)

    def test_setCourt(self):
        new_court = DUMMY
        old_court = self.nomin.court()

        # Only the owner must be able to set the court.
        self.nomin.setCourt(self.nomin.owner(), new_court)
        self.assertEqual(self.nomin.court(), new_court)
        self.assertReverts(self.nomin.setCourt, DUMMY, new_court)
        self.nomin.setCourt(self.nomin.owner(), old_court)

    def test_setHavven(self):
        new_havven = DUMMY
        old_havven = self.nomin.havven()

        # Only the owner must be able to set the court.
        self.nomin.setHavven(self.nomin.owner(), new_havven)
        self.assertEqual(self.nomin.havven(), new_havven)
        self.assertReverts(self.nomin.setHavven, DUMMY, old_havven)
        self.nomin.setHavven(self.nomin.owner(), old_havven)

    def test_transfer(self):
        target = fresh_account()

        self.nomin.giveNomins(MASTER, MASTER, 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(MASTER), 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.nomin.transfer, MASTER, self.nomin_contract.address, UNIT)

        self.nomin.transfer(MASTER, target, 5 * UNIT)

        self.assertClose(self.nomin.balanceOf(MASTER), 5 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(5 * UNIT))
        self.assertEqual(self.nomin.feePool(), self.nomin.transferFeeIncurred(self.nomin.priceToSpend(5 * UNIT)))

        self.nomin.debugFreezeAccount(MASTER, target)

        self.assertEqual(self.nomin.balanceOf(target), 0)

        self.assertReverts(self.nomin.transfer, MASTER, target, UNIT)
        self.assertReverts(self.nomin.transfer, target, MASTER, UNIT)

        self.nomin.unfreezeAccount(MASTER, target)

        self.assertEqual(self.nomin.balanceOf(target), 0)

        self.nomin.transfer(MASTER, target, 5 * UNIT)

        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(5 * UNIT))
        self.assertLess(self.nomin.balanceOf(MASTER), 3)  # assert MASTER only has the tiniest bit of change

    def test_transferFrom(self):
        target = fresh_account()

        self.nomin.giveNomins(MASTER, MASTER, 10 * UNIT)

        # Unauthorized transfers should not work
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, UNIT)

        # Neither should transfers that are too large for the allowance.
        self.nomin.approve(MASTER, DUMMY, UNIT)
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, 2 * UNIT)

        self.nomin.approve(MASTER, DUMMY, 10000 * UNIT)

        self.assertEqual(self.nomin.balanceOf(MASTER), 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, self.nomin_contract.address, UNIT)

        self.nomin.transferFrom(DUMMY, MASTER, target, 5 * UNIT)

        self.assertClose(self.nomin.balanceOf(MASTER), 5 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(5 * UNIT))
        self.assertEqual(self.nomin.feePool(), self.nomin.transferFeeIncurred(self.nomin.priceToSpend(5 * UNIT)))

        self.nomin.debugFreezeAccount(MASTER, target)

        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, UNIT)
        self.assertReverts(self.nomin.transferFrom, DUMMY, target, MASTER, UNIT)

        self.nomin.unfreezeAccount(MASTER, target)

        self.nomin.transferFrom(DUMMY, MASTER, target, 5 * UNIT)

        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(5 * UNIT))
        self.assertLess(self.nomin.balanceOf(MASTER), 3)  # assert MASTER only has the tiniest bit of change

    def test_transferSenderPaysFee(self):
        target = fresh_account()

        self.nomin.giveNomins(MASTER, MASTER, 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(MASTER), 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.nomin.transfer, MASTER, self.nomin_contract.address, UNIT)

        self.nomin.transferSenderPaysFee(MASTER, target, 5 * UNIT)

        self.assertClose(self.nomin.balanceOf(MASTER), 5 * UNIT - self.nomin.transferFeeIncurred(5 * UNIT))
        self.assertEqual(self.nomin.balanceOf(target), 5 * UNIT)
        self.assertEqual(self.nomin.feePool(), self.nomin.transferFeeIncurred(5 * UNIT))

        self.nomin.debugFreezeAccount(MASTER, target)

        self.assertEqual(self.nomin.balanceOf(target), 0)

        self.assertReverts(self.nomin.transfer, MASTER, target, UNIT)
        self.assertReverts(self.nomin.transfer, target, MASTER, UNIT)

        self.nomin.unfreezeAccount(MASTER, target)

        self.assertEqual(self.nomin.balanceOf(target), 0)

        old_bal = self.nomin.balanceOf(MASTER)

        self.nomin.transferSenderPaysFee(MASTER, target, self.nomin.priceToSpend(old_bal))

        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(old_bal))
        self.assertLess(self.nomin.balanceOf(MASTER), 3)  # assert MASTER only has the tiniest bit of change

    def test_transferFromSenderPaysFee(self):
        target = fresh_account()

        self.nomin.giveNomins(MASTER, MASTER, 10 * UNIT)

        # Unauthorized transfers should not work
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, UNIT)

        # Neither should transfers that are too large for the allowance.
        self.nomin.approve(MASTER, DUMMY, UNIT)
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, 2 * UNIT)

        self.nomin.approve(MASTER, DUMMY, 10000 * UNIT)

        self.assertEqual(self.nomin.balanceOf(MASTER), 10 * UNIT)
        self.assertEqual(self.nomin.balanceOf(target), 0)

        # Should be impossible to transfer to the nomin contract itself.
        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, self.nomin_contract.address, UNIT)

        self.nomin.transferFromSenderPaysFee(DUMMY, MASTER, target, 5 * UNIT)

        self.assertClose(self.nomin.balanceOf(MASTER), 5 * UNIT - self.nomin.transferFeeIncurred(5 * UNIT))
        self.assertEqual(self.nomin.balanceOf(target), 5 * UNIT)
        self.assertEqual(self.nomin.feePool(), self.nomin.transferFeeIncurred(5 * UNIT))

        self.nomin.debugFreezeAccount(MASTER, target)

        self.assertReverts(self.nomin.transferFrom, DUMMY, MASTER, target, UNIT)
        self.assertReverts(self.nomin.transferFrom, DUMMY, target, MASTER, UNIT)

        self.nomin.unfreezeAccount(MASTER, target)

        old_bal = self.nomin.balanceOf(MASTER)

        self.nomin.transferFromSenderPaysFee(DUMMY, MASTER, target, self.nomin.priceToSpend(old_bal))

        self.assertEqual(self.nomin.balanceOf(target), self.nomin.priceToSpend(old_bal))
        self.assertLess(self.nomin.balanceOf(MASTER), 3)  # assert MASTER only has the tiniest bit of change

    def test_confiscateBalance(self):
        target = W3.eth.accounts[2]

        self.assertEqual(self.nomin.court(), self.fake_court.address)

        self.nomin.giveNomins(MASTER, target, 10 * UNIT)

        # The target must have some nomins.
        self.assertEqual(self.nomin.balanceOf(target), 10 * UNIT)

        motion_id = 1
        self.fake_court.setTargetMotionID(MASTER, target, motion_id)

        # Attempt to confiscate even though the conditions are not met.
        self.fake_court.setConfirming(MASTER, motion_id, False)
        self.fake_court.setVotePasses(MASTER, motion_id, False)
        self.assertReverts(self.fake_court.confiscateBalance, MASTER, target)

        self.fake_court.setConfirming(MASTER, motion_id, True)
        self.fake_court.setVotePasses(MASTER, motion_id, False)
        self.assertReverts(self.fake_court.confiscateBalance, MASTER, target)

        self.fake_court.setConfirming(MASTER, motion_id, False)
        self.fake_court.setVotePasses(MASTER, motion_id, True)
        self.assertReverts(self.fake_court.confiscateBalance, MASTER, target)

        # Set up the target balance to be confiscatable.
        self.fake_court.setConfirming(MASTER, motion_id, True)
        self.fake_court.setVotePasses(MASTER, motion_id, True)

        # Only the court should be able to confiscate balances.
        self.assertReverts(self.nomin.confiscateBalance, MASTER, target)

        # Actually confiscate the balance.
        pre_fee_pool = self.nomin.feePool()
        pre_balance = self.nomin.balanceOf(target)
        self.fake_court.confiscateBalance(MASTER, target)
        self.assertEqual(self.nomin.balanceOf(target), 0)
        self.assertEqual(self.nomin.feePool(), pre_fee_pool + pre_balance)
        self.assertTrue(self.nomin.frozen(target))

    def test_unfreezeAccount(self):
        target = fresh_account()

        # The nomin contract itself should not be unfreezable.
        tx_receipt = self.nomin.unfreezeAccount(MASTER, self.nomin_contract.address)
        self.assertTrue(self.nomin.frozen(self.nomin_contract.address))
        self.assertEqual(len(tx_receipt.logs), 0)

        # Unfreezing non-frozen accounts should not do anything.
        self.assertFalse(self.nomin.frozen(target))
        tx_receipt = self.nomin.unfreezeAccount(MASTER, target)
        self.assertFalse(self.nomin.frozen(target))
        self.assertEqual(len(tx_receipt.logs), 0)

        self.nomin.debugFreezeAccount(MASTER, target)
        self.assertTrue(self.nomin.frozen(target))

        # Only the owner should be able to unfreeze an account.
        self.assertReverts(self.nomin.unfreezeAccount, target, target)

        tx_receipt = self.nomin.unfreezeAccount(MASTER, target)
        self.assertFalse(self.nomin.frozen(target))

        # Unfreezing should emit the appropriate log.
        log = get_event_data_from_log(self.nomin_event_dict, tx_receipt.logs[0])
        self.assertEqual(log['event'], 'AccountUnfrozen')

    def test_issue_burn(self):
        havven, acc1, acc2 = fresh_accounts(3)
        self.nomin.setHavven(MASTER, havven)

        # not even the owner can issue, only the havven contract
        self.assertReverts(self.nomin.issue, MASTER, acc1, 100 * UNIT)
        self.nomin.issue(havven, acc1, 100 * UNIT)
        self.assertEqual(self.nomin.balanceOf(acc1), 100 * UNIT)
        self.assertEqual(self.nomin.totalSupply(), 100 * UNIT)
        self.nomin.issue(havven, acc2, 200 * UNIT)
        self.assertEqual(self.nomin.balanceOf(acc2), 200 * UNIT)
        self.assertEqual(self.nomin.totalSupply(), 300 * UNIT)

        self.nomin.transfer(acc1, acc2, 50 * UNIT)
        self.assertNotEqual(self.nomin.totalSupply(), self.nomin.balanceOf(acc1) + self.nomin.balanceOf(acc2))
        self.assertEqual(self.nomin.totalSupply(), self.nomin.balanceOf(acc1) + self.nomin.balanceOf(acc2) + self.nomin.feePool())

        acc1_bal = self.nomin.balanceOf(acc1)
        # not even the owner can burn...
        self.assertReverts(self.nomin.burn, MASTER, acc1, acc1_bal)
        self.nomin.burn(havven, acc1, acc1_bal)
        self.assertEqual(self.nomin.totalSupply(), self.nomin.balanceOf(acc2) + self.nomin.feePool())

        # burning more than issued is allowed, as that logic is controlled in the havven contract
        self.nomin.burn(havven, acc2, self.nomin.balanceOf(acc2))

        self.assertEqual(self.nomin.balanceOf(acc1), self.nomin.balanceOf(acc2), 0)

    def test_edge_issue_burn(self):
        havven, acc1, acc2 = fresh_accounts(3)
        self.nomin.setHavven(MASTER, havven)

        max_int = 2**256 - 1
        self.nomin.issue(havven, acc1, 100 * UNIT)
        self.assertReverts(self.nomin.issue, havven, acc1, max_int)
        self.assertReverts(self.nomin.issue, havven, acc2, max_int)
        # there shouldn't be a way to burn towards a larger value by overflowing
        self.assertReverts(self.nomin.burn, havven, acc1, max_int)
        self.nomin.burn(havven, acc1, 100 * UNIT)

        # as long as no nomins exist, its a valid action
        self.nomin.issue(havven, acc2, max_int)
        self.nomin.burn(havven, acc2, max_int)

