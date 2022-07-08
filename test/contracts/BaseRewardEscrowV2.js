'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken } = require('./setup');

const {
	prepareSmocks,
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const { toUnit, currentTime, fastForward } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const BN = require('bn.js');
const ethers = require('ethers');
const { parseEther } = ethers.utils;

contract('BaseRewardEscrowV2', async accounts => {
	const WEEK = 604800;
	const YEAR = 31556926;

	const [, owner, account1, account2, account3] = accounts;
	let baseRewardEscrowV2,
		baseRewardEscrowV2Frozen,
		rewardEscrowV2Storage,
		mocks,
		feePoolAccount,
		mockedSynthetix,
		resolver;

	addSnapshotBeforeRestoreAfterEach();

	function assertWithFallback(title, assertFunc) {
		it(title, async () => {
			await assertFunc(baseRewardEscrowV2, rewardEscrowV2Storage);
		});

		it(title + ' (using fallback)', async () => {
			// need to create a storage contract for full testing
			const newRewardEscrowV2Storage = await artifacts
				.require('RewardEscrowV2Storage')
				.new(owner, resolver.address);

			// initialise new one falling back to this one
			const newRewardEscrowV2 = await artifacts
				.require('BaseRewardEscrowV2')
				.new(owner, resolver.address);

			// set state write access for storage contract
			await newRewardEscrowV2Storage.setAssociatedContract(newRewardEscrowV2.address, {
				from: owner,
			});
			// set the fallback to previous reward escrow
			await newRewardEscrowV2Storage.setFallbackRewardEscrow(baseRewardEscrowV2.address, {
				from: owner,
			});

			// add the real contract to mocks so that the mock resolver returns its address
			// when BaseRewardEscrowV2 is constructed
			mocks['RewardEscrowV2Storage'] = newRewardEscrowV2Storage;

			// update the resolver for baseRewardEscrowV2
			await newRewardEscrowV2.rebuildCache({ from: owner });

			const balance = await mockedSynthetix.balanceOf(baseRewardEscrowV2.address);
			// in hypothetical migration snx balance would be transferred over to new escrow contract
			// TODO: the `mockToken` implementation does not make it easy to do unchecked transfers,
			// so we don't have an easy way to check if the old contract somehow got funds or not other than
			// revert
			await mockedSynthetix.transfer(newRewardEscrowV2.address, balance, {
				from: owner,
			});

			await assertFunc(newRewardEscrowV2, newRewardEscrowV2Storage);
		});
	}

	// Run once at beginning - snapshots will take care of resetting this before each test
	beforeEach(async () => {
		({ mocks, resolver } = await prepareSmocks({
			contracts: ['FeePool', 'Issuer', 'Synthetix'],
			accounts: accounts.slice(10), // mock using accounts after the first few
		}));

		// create our own mock for SNX ERC20
		({ token: mockedSynthetix } = await mockToken({
			accounts,
			name: 'Synthetix',
			symbol: 'SNX',
		}));

		// set feePool address
		feePoolAccount = mocks['FeePool'].address;

		// initialise frozen escrow contract
		baseRewardEscrowV2Frozen = await artifacts
			.require('BaseRewardEscrowV2Frozen')
			.new(owner, resolver.address);

		// initialise storage contract
		rewardEscrowV2Storage = await artifacts
			.require('RewardEscrowV2Storage')
			.new(owner, ZERO_ADDRESS);
		// add the real contract to mocks so that the mock resolver returns its address
		// when BaseRewardEscrowV2 is constructed
		mocks['RewardEscrowV2Storage'] = rewardEscrowV2Storage;

		// initialise escrow contract
		baseRewardEscrowV2 = await artifacts.require('BaseRewardEscrowV2').new(owner, resolver.address);

		// set state write access for storage contract
		await rewardEscrowV2Storage.setAssociatedContract(baseRewardEscrowV2.address, {
			from: owner,
		});
		// set the fallback to previous reward escrow
		await rewardEscrowV2Storage.setFallbackRewardEscrow(baseRewardEscrowV2Frozen.address, {
			from: owner,
		});
		// update the resolver for baseRewardEscrowV2
		await baseRewardEscrowV2.rebuildCache({ from: owner });
	});

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: baseRewardEscrowV2.abi,
			ignoreParents: ['MixinResolver', 'Owned'],
			expected: [
				'appendVestingEntry',
				'startMergingWindow',
				'setAccountMergingDuration',
				'setMaxAccountMergingWindow',
				'setMaxEscrowDuration',
				'nominateAccountToMerge',
				'mergeAccount',
				'migrateVestingSchedule',
				'migrateAccountEscrowBalances',
				'burnForMigration',
				'importVestingEntries',
				'createEscrowEntry',
				'vest',
				'revokeFrom',
			],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await baseRewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
		it('should set nextEntryId to 1', async () => {
			const nextEntryId = await baseRewardEscrowV2.nextEntryId();
			assert.equal(nextEntryId, 1);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
		it('then totalEscrowedAccountBalance should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.totalEscrowedAccountBalance(account1));
		});
		it('then totalVestedAccountBalance should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.totalVestedAccountBalance(account1));
		});
	});

	describe('Creating vesting Schedule', async () => {
		describe('When appending vesting entry via feePool', async () => {
			let duration = YEAR;
			it('should revert appending a vesting entry from account1', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('10'));

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('1'), duration, {
						from: account1,
					}),
					'Only the FeePool can perform this action'
				);
			});
			it('should revert appending a vesting entry with a zero amount', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('1'));

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('0'), duration, {
						from: feePoolAccount,
					}),
					'Quantity cannot be zero'
				);
			});
			it('should revert appending a vesting entry if there is not enough SNX in the contracts balance', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('1'));

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Must be enough balance in the contract to provide for the vesting entry'
				);
			});
			it('should revert appending a vesting entry if the duration is 0', async () => {
				duration = 0;

				// Transfer of SNX to the escrow must occur before creating an entry
				mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('10'));

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Cannot escrow with 0 duration OR above max_duration'
				);
			});
			it('should revert appending a vesting entry if the duration is > max_duration', async () => {
				duration = (await baseRewardEscrowV2.max_duration()).add(toUnit(1));

				// Transfer of SNX to the escrow must occur before creating an entry
				mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('10'));

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Cannot escrow with 0 duration OR above max_duration'
				);
			});
			describe('When successfully appending new escrow entry for account 1 with 10 SNX', () => {
				let entryID, now, escrowAmount;
				beforeEach(async () => {
					duration = 1 * YEAR;

					entryID = await baseRewardEscrowV2.nextEntryId();

					now = await currentTime();

					escrowAmount = toUnit('10');

					// Transfer of SNX to the escrow must occur before creating an entry
					mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('10'));

					// Append vesting entry
					await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
						from: feePoolAccount,
					});
				});

				assertWithFallback('Should return the vesting entry for account 1 and entryID', async e => {
					const vestingEntry = await e.getVestingEntry(account1, entryID);

					// endTime is 1 year after
					assert.isTrue(vestingEntry.endTime.gte(now + duration));

					// escrowAmount is 10
					assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);
				});
				assertWithFallback('Should increment the nextEntryID', async e =>
					assert.bnEqual(await e.nextEntryId(), entryID.add(new BN(1)))
				);
				assertWithFallback('Account 1 should have balance of 10 SNX', async e =>
					assert.bnEqual(await e.balanceOf(account1), escrowAmount)
				);
				assertWithFallback('totalEscrowedBalance of the contract should be 10 SNX', async e =>
					assert.bnEqual(await e.totalEscrowedBalance(), escrowAmount)
				);
				assertWithFallback('Account1 should have totalVested Account1 Balance of 0', async e =>
					assert.bnEqual(await e.totalVestedAccountBalance(account1), new BN(0))
				);
				assertWithFallback('Account1 numvestingEntries is 1', async e =>
					assert.bnEqual(await e.numVestingEntries(account1), new BN(1))
				);
				describe('When 6 months has passed', () => {
					let timeElapsed;
					beforeEach(async () => {
						timeElapsed = YEAR / 2;
						await fastForward(timeElapsed);
					});
					assertWithFallback('then the vesting entry has 0 snx claimable', async e => {
						const claimable = await e.getVestingEntryClaimable(account1, entryID);
						assert.bnEqual(claimable, 0);
					});
				});
				describe('When one year has passed after the vesting end time', () => {
					let vestingEntry;
					beforeEach(async () => {
						await fastForward(YEAR + 1);
						vestingEntry = await baseRewardEscrowV2.getVestingEntry(account1, entryID);
					});
					assertWithFallback('then the vesting entry is fully claimable', async e => {
						const claimable = await e.getVestingEntryClaimable(account1, entryID);
						assert.bnEqual(claimable, vestingEntry.escrowAmount);
					});
				});
			});
		});
	});

	describe('Creating a new escrow entry by approval', async () => {
		let duration, entryID;
		beforeEach(async () => {
			// approve rewardEscrow to spend SNX
			mocks['Synthetix'].smocked.allowance.will.return.with(parseEther('10'));

			// stub transferFrom
			mocks['Synthetix'].smocked.transferFrom.will.return.with(true);

			// stub balanceOf
			mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('10'));

			duration = 1 * YEAR;
		});
		assertWithFallback('should revert if escrow duration is greater than max_duration', async e => {
			const maxDuration = await baseRewardEscrowV2.max_duration();
			await assert.revert(
				e.createEscrowEntry(account1, new BN(1000), maxDuration + 10, {
					from: owner,
				}),
				'Cannot escrow with 0 duration OR above max_duration'
			);
		});
		assertWithFallback('should revert if escrow duration is 0', async e => {
			await assert.revert(
				e.createEscrowEntry(account1, new BN(1000), 0, {
					from: owner,
				}),
				'Cannot escrow with 0 duration OR above max_duration'
			);
		});
		assertWithFallback('should revert when beneficiary is address zero', async e => {
			await assert.revert(
				e.createEscrowEntry(ZERO_ADDRESS, toUnit('1'), duration),
				'Cannot create escrow with address(0)'
			);
		});
		assertWithFallback('should revert when msg.sender has no approval to spend', async e => {
			await assert.revert(
				e.createEscrowEntry(ZERO_ADDRESS, toUnit('10'), duration, {
					from: account1,
				})
			);
		});
		describe('when successfully creating a new escrow entry for acount 1', () => {
			let vestingEntry, escrowAmount, now;
			beforeEach(async () => {
				now = currentTime();
				escrowAmount = toUnit('10');

				const expectedEntryID = await baseRewardEscrowV2.nextEntryId();

				await baseRewardEscrowV2.createEscrowEntry(account1, escrowAmount, duration, {
					from: owner,
				});

				// retrieve the vesting entryID from account 1's list of account vesting entrys
				entryID = await baseRewardEscrowV2.accountVestingEntryIDs(account1, 0);

				assert.bnEqual(entryID, expectedEntryID);
			});

			assertWithFallback('Should have created a new vesting entry for account 1', async e => {
				vestingEntry = await e.getVestingEntry(account1, entryID);

				assert.isTrue(vestingEntry.endTime.gte(now + duration));

				// escrowAmount is 10
				assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);
			});
			assertWithFallback('Should increment the nextEntryID', async e =>
				assert.bnEqual(await e.nextEntryId(), entryID.add(new BN(1)))
			);
			assertWithFallback('totalEscrowedBalance of the contract should be 10 SNX', async e =>
				assert.bnEqual(await e.totalEscrowedBalance(), escrowAmount)
			);
			assertWithFallback('Account1 should have balance of 10 SNX', async e =>
				assert.bnEqual(await e.balanceOf(account1), escrowAmount)
			);
			assertWithFallback('Account1 should have totalVested Account Balance of 0', async e =>
				assert.bnEqual(await e.totalVestedAccountBalance(account1), new BN(0))
			);
			assertWithFallback('Account1 numVestingEntries is 1', async e =>
				assert.bnEqual(await e.numVestingEntries(account1), new BN(1))
			);
		});
	});

	describe('Vesting', () => {
		beforeEach(async () => {
			// replace synthetix on resolver (see prepareSmocks() for why this works)
			mocks['Synthetix'] = mockedSynthetix;

			// rebuild cache
			await baseRewardEscrowV2.rebuildCache({ from: owner });

			// Transfer of SNX to the escrow must occur before creating a vestinng entry
			await mockedSynthetix.transfer(baseRewardEscrowV2.address, toUnit('1000'), {
				from: owner,
			});
		});
		describe('Vesting of vesting entry after 6 months (before escrow ends)', () => {
			const duration = 1 * YEAR;

			let escrowAmount, timeElapsed, entryID, claimableSNX;
			beforeEach(async () => {
				escrowAmount = toUnit('1000');
				timeElapsed = 26 * WEEK;

				entryID = await baseRewardEscrowV2.nextEntryId();

				// Add a few vesting entries as the feepool address
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
					from: feePoolAccount,
				});

				// Need to go into the future to vest
				await fastForward(timeElapsed);
			});

			assertWithFallback(
				'should vest 0 amount if entryID does not exist for user',
				async (e, s) => {
					const randomID = 200;
					await e.vest([randomID], { from: account1 });

					// Check user has no vested SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('0'));

					// Check rewardEscrow does not have any SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), escrowAmount);

					// Check total escrowedAccountBalance is unchanged
					const escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
					assert.bnEqual(escrowedAccountBalance, escrowAmount);

					// Account should have 0 vested account balance
					const totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
					assert.bnEqual(totalVestedAccountBalance, toUnit('0'));
				}
			);

			assertWithFallback('should have 0% of the vesting entry claimable', async e => {
				const expectedAmount = 0;
				assert.bnEqual(await e.getVestingEntryClaimable(account1, entryID), expectedAmount);
			});

			assertWithFallback(
				'should vest and transfer 0 SNX from contract to the user',
				async (e, s) => {
					claimableSNX = await baseRewardEscrowV2.getVestingEntryClaimable(account1, entryID);

					const escrowBalanceBefore = await mockedSynthetix.balanceOf(e.address);
					const totalEscrowedBalanceBefore = await e.totalEscrowedBalance();
					const accountEscrowedBalanceBefore = await e.totalEscrowedAccountBalance(account1);
					const accountTotalVestedBefore = await e.totalVestedAccountBalance(account1);

					// Vest
					await e.vest([entryID], { from: account1 });

					// Check user has the 0 vested SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), 0);

					// Check rewardEscrow contract has same amount of SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), escrowBalanceBefore);

					const vestingEntryAfter = await e.getVestingEntry(account1, entryID);

					// claimableSNX is 0
					assert.bnEqual(claimableSNX, 0);

					// same total escrowed balance
					assert.bnEqual(await e.totalEscrowedBalance(), totalEscrowedBalanceBefore);

					// same user totalEscrowedAccountBalance
					assert.bnEqual(
						await e.totalEscrowedAccountBalance(account1),
						accountEscrowedBalanceBefore
					);

					// user totalVestedAccountBalance is same
					assert.bnEqual(await e.totalVestedAccountBalance(account1), accountTotalVestedBefore);

					// escrow amount still same on entry
					assert.bnEqual(vestingEntryAfter.escrowAmount, escrowAmount);
				}
			);
		});

		describe('When vesting after escrow ended', () => {
			let escrowAmount, duration, entryID;
			beforeEach(async () => {
				duration = 1 * YEAR;
				escrowAmount = toUnit('1000');

				entryID = await baseRewardEscrowV2.nextEntryId();

				// Add a few vesting entries as the feepool address
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
					from: feePoolAccount,
				});

				// fast forward to after escrow.endTime
				fastForward(duration + 10);
			});
			assertWithFallback('should vest and transfer all the snx to the user', async (e, s) => {
				await e.vest([entryID], { from: account1 });

				// Check user has all their vested SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(account1), escrowAmount);

				// Check rewardEscrow does not have any SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('0'));
			});

			assertWithFallback('should vest and emit a Vest event', async e => {
				const vestTransaction = await e.vest([entryID], {
					from: account1,
				});

				// Vested(msg.sender, now, total);
				const vestedEvent = vestTransaction.logs.find(log => log.event === 'Vested');
				assert.eventEqual(vestedEvent, 'Vested', {
					beneficiary: account1,
					value: escrowAmount,
				});
			});

			assertWithFallback('should vest and update totalEscrowedAccountBalance', async e => {
				// This account should have an escrowedAccountBalance
				let escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, escrowAmount);

				// Vest
				await e.vest([entryID], {
					from: account1,
				});

				// This account should not have any amount escrowed
				escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, toUnit('0'));
			});

			assertWithFallback('should vest and update totalVestedAccountBalance', async e => {
				// This account should have zero totalVestedAccountBalance
				let totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, toUnit('0'));

				// Vest
				await e.vest([entryID], {
					from: account1,
				});

				// This account should have vested its whole amount
				totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, escrowAmount);
			});

			assertWithFallback('should vest and update totalEscrowedBalance', async e => {
				await e.vest([entryID], {
					from: account1,
				});

				// There should be no Escrowed balance left in the contract
				assert.bnEqual(await e.totalEscrowedBalance(), toUnit('0'));
			});
			assertWithFallback('should vest and update entryID.escrowAmount to 0', async e => {
				await e.vest([entryID], {
					from: account1,
				});

				// There should be no escrowedAmount on entry
				const entry = await e.getVestingEntry(account1, entryID);
				assert.bnEqual(entry.escrowAmount, toUnit('0'));
			});
		});

		describe('Vesting multiple vesting entries', () => {
			const duration = 1 * YEAR;
			let escrowAmount1, escrowAmount2, escrowAmount3, entryID1, entryID2, entryID3;

			beforeEach(async () => {
				escrowAmount1 = toUnit('200');
				escrowAmount2 = toUnit('300');
				escrowAmount3 = toUnit('500');

				// Add a few vesting entries as the feepool address
				entryID1 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount1, duration, {
					from: feePoolAccount,
				});
				await fastForward(WEEK);

				entryID2 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount2, duration, {
					from: feePoolAccount,
				});
				await fastForward(WEEK);

				entryID3 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount3, duration, {
					from: feePoolAccount,
				});

				// Need to go into the future to vest all entries
				await fastForward(duration + WEEK * 3);
			});

			assertWithFallback('should have three vesting entries for the user', async e => {
				const numOfEntries = await e.numVestingEntries(account1);
				assert.bnEqual(numOfEntries, new BN(3));
			});

			describe('When another user (account 1) vests all their entries', () => {
				assertWithFallback('should vest all entries and transfer snx to the user', async (e, s) => {
					await e.vest([entryID1, entryID2, entryID3], {
						from: account2,
					});

					// Check account1 has no SNX in their balance
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('0'));

					// Check account2 has no SNX in their balance
					assert.bnEqual(await mockedSynthetix.balanceOf(account2), toUnit('0'));

					// Check rewardEscrow has all the SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('1000'));
				});
			});

			assertWithFallback(
				'should vest all entries and transfer snx from contract to the user',
				async (e, s) => {
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// Check user has all their vested SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('1000'));

					// Check rewardEscrow does not have any SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('0'));
				}
			);

			assertWithFallback('should vest and emit a Vest event', async e => {
				const vestTx = await e.vest([entryID1, entryID2, entryID3], {
					from: account1,
				});

				// Vested(msg.sender, now, total);
				const vestedEvent = vestTx.logs.find(log => log.event === 'Vested');
				assert.eventEqual(vestedEvent, 'Vested', {
					beneficiary: account1,
					value: toUnit('1000'),
				});
			});

			assertWithFallback('should vest and update totalEscrowedAccountBalance', async e => {
				// This account should have an escrowedAccountBalance
				let escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, toUnit('1000'));

				// Vest
				await e.vest([entryID1, entryID2, entryID3], {
					from: account1,
				});

				// This account should not have any amount escrowed
				escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, toUnit('0'));
			});

			assertWithFallback('should vest and update totalVestedAccountBalance', async e => {
				// This account should have zero totalVestedAccountBalance
				let totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, toUnit('0'));

				// Vest
				await e.vest([entryID1, entryID2, entryID3], {
					from: account1,
				});

				// This account should have vested its whole amount
				totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, toUnit('1000'));
			});

			assertWithFallback('should vest and update totalEscrowedBalance', async e => {
				await e.vest([entryID1, entryID2, entryID3], {
					from: account1,
				});
				// There should be no Escrowed balance left in the contract
				assert.bnEqual(await e.totalEscrowedBalance(), toUnit('0'));
			});

			assertWithFallback(
				'should vest all entries and ignore duplicate attempts to vest same entries again',
				async (e, s) => {
					// Vest attempt 1
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// Check user has all their vested SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('1000'));

					// Check rewardEscrow does not have any SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('0'));

					// Vest attempt 2
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// Check user has same amount of SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('1000'));

					// Check rewardEscrow does not have any SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('0'));
				}
			);
		});

		describe('Vesting multiple vesting entries with different duration / end time', () => {
			const duration = 1 * YEAR;
			let escrowAmount1, escrowAmount2, escrowAmount3, entryID1, entryID2, entryID3;

			beforeEach(async () => {
				escrowAmount1 = toUnit('200');
				escrowAmount2 = toUnit('300');
				escrowAmount3 = toUnit('500');

				// Add a few vesting entries as the feepool address
				entryID1 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount1, duration, {
					from: feePoolAccount,
				});
				await fastForward(WEEK);

				entryID2 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount2, duration, {
					from: feePoolAccount,
				});
				await fastForward(WEEK);

				// EntryID3 has a longer duration than other entries
				const twoYears = 2 * 52 * WEEK;
				entryID3 = await baseRewardEscrowV2.nextEntryId();
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount3, twoYears, {
					from: feePoolAccount,
				});
			});

			assertWithFallback('should have three vesting entries for the user', async e => {
				const numOfEntries = await e.numVestingEntries(account1);
				assert.bnEqual(numOfEntries, new BN(3));
			});

			describe('When another user (account 1) vests all their entries', () => {
				assertWithFallback('should vest all entries and transfer snx to the user', async (e, s) => {
					await e.vest([entryID1, entryID2, entryID3], {
						from: account2,
					});

					// Check account1 has no SNX in their balance
					assert.bnEqual(await mockedSynthetix.balanceOf(account1), toUnit('0'));

					// Check account2 has no SNX in their balance
					assert.bnEqual(await mockedSynthetix.balanceOf(account2), toUnit('0'));

					// Check rewardEscrow has all the SNX
					assert.bnEqual(await mockedSynthetix.balanceOf(e.address), toUnit('1000'));
				});
			});

			describe('when the first two entrys are vestable', () => {
				beforeEach(async () => {
					// Need to go into the future to vest first two entries
					await fastForward(duration + WEEK * 2);
				});

				assertWithFallback(
					'should vest only first 2 entries and transfer snx from contract to the user',
					async (e, s) => {
						await e.vest([entryID1, entryID2, entryID3], {
							from: account1,
						});

						// Check user has entry1 + entry2 amount
						assert.bnEqual(
							await mockedSynthetix.balanceOf(account1),
							escrowAmount1.add(escrowAmount2)
						);

						// Check rewardEscrow has remaining entry3 amount
						assert.bnEqual(await mockedSynthetix.balanceOf(e.address), escrowAmount3);
					}
				);

				assertWithFallback('should vest and emit a Vest event', async e => {
					const vestTx = await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// Vested(msg.sender, now, total);
					const vestedEvent = vestTx.logs.find(log => log.event === 'Vested');
					assert.eventEqual(vestedEvent, 'Vested', {
						beneficiary: account1,
						value: toUnit('500'),
					});
				});

				assertWithFallback('should vest and update totalEscrowedAccountBalance', async e => {
					// This account should have an escrowedAccountBalance
					let escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
					assert.bnEqual(escrowedAccountBalance, toUnit('1000'));

					// Vest
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// This account should have any 500 SNX escrowed
					escrowedAccountBalance = await e.totalEscrowedAccountBalance(account1);
					assert.bnEqual(escrowedAccountBalance, escrowAmount3);
				});

				assertWithFallback('should vest and update totalVestedAccountBalance', async e => {
					// This account should have zero totalVestedAccountBalance before
					let totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
					assert.bnEqual(totalVestedAccountBalance, toUnit('0'));

					// Vest
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});

					// This account should have vested entry 1 and entry 2 amounts
					totalVestedAccountBalance = await e.totalVestedAccountBalance(account1);
					assert.bnEqual(totalVestedAccountBalance, escrowAmount1.add(escrowAmount2));
				});

				assertWithFallback('should vest and update totalEscrowedBalance', async e => {
					await e.vest([entryID1, entryID2, entryID3], {
						from: account1,
					});
					// There should be escrowAmount3's Escrowed balance left in the contract
					assert.bnEqual(await e.totalEscrowedBalance(), escrowAmount3);
				});

				assertWithFallback(
					'should vest entryID1 and entryID2 and ignore duplicate attempts to vest same entries again',
					async (e, s) => {
						// Vest attempt 1
						await e.vest([entryID1, entryID2, entryID3], {
							from: account1,
						});

						// Check user have vested escrowAmount1 and escrowAmount2 SNX
						assert.bnEqual(
							await mockedSynthetix.balanceOf(account1),
							escrowAmount1.add(escrowAmount2)
						);

						// Check rewardEscrow does has escrowAmount3 SNX
						assert.bnEqual(await mockedSynthetix.balanceOf(e.address), escrowAmount3);

						// Vest attempt 2
						await e.vest([entryID1, entryID2, entryID3], {
							from: account1,
						});

						// Check user has same amount of SNX
						assert.bnEqual(
							await mockedSynthetix.balanceOf(account1),
							escrowAmount1.add(escrowAmount2)
						);

						// Check rewardEscrow has same escrowAmount3 SNX
						assert.bnEqual(await mockedSynthetix.balanceOf(e.address), escrowAmount3);
					}
				);
			});
		});
	});

	describe('revokeFrom', () => {
		const duration = 1 * YEAR;
		let escrowAmount, timeElapsed, firstEntryId;

		beforeEach(async () => {
			// replace synthetix on resolver (see prepareSmocks() for why this works)
			mocks['Synthetix'] = mockedSynthetix;

			// rebuild cache
			await baseRewardEscrowV2.rebuildCache({ from: owner });

			// Transfer of SNX to the escrow must occur before creating a vestinng entry
			await mockedSynthetix.transfer(baseRewardEscrowV2.address, toUnit('2000'), {
				from: owner,
			});
		});
		beforeEach(async () => {
			escrowAmount = toUnit('1000');
			timeElapsed = 26 * WEEK;

			firstEntryId = await baseRewardEscrowV2.nextEntryId();

			// Add two vesting entries as the feepool address
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
				from: feePoolAccount,
			});
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
				from: feePoolAccount,
			});

			// Need to go into the future to vest
			await fastForward(timeElapsed);
		});

		assertWithFallback('should revert when calling from non Synthetix address', async (e, s) => {
			await assert.revert(
				e.revokeFrom(account1, account3, toUnit(1000), 0, { from: account1 }),
				'Only Synthetix'
			);
			await assert.revert(
				e.revokeFrom(account1, account3, toUnit(1000), 0, { from: account2 }),
				'Only Synthetix'
			);
		});

		assertWithFallback('should revert on invalid inputs', async (e, s) => {
			await assert.revert(
				mockedSynthetix.revokeFrom(e.address, ZERO_ADDRESS, account3, toUnit(2000), 0),
				'account not set'
			);
			await assert.revert(
				mockedSynthetix.revokeFrom(e.address, account1, ZERO_ADDRESS, toUnit(2000), 0),
				'recipient not set'
			);
			await assert.revert(
				mockedSynthetix.revokeFrom(e.address, account1, account3, toUnit(3000), 0),
				'less than target'
			);
			await assert.revert(
				mockedSynthetix.revokeFrom(e.address, account1, account3, toUnit(2000), 10),
				'startIndex'
			);
			await assert.revert(
				mockedSynthetix.revokeFrom(e.address, account1, account3, toUnit(0), 10),
				'targetAmount'
			);
		});

		assertWithFallback(
			'should revoke and transfer SNX from contract to the recipient before vesting duration',
			async (e, s) => {
				const accountEscrowedBalanceBefore = await e.totalEscrowedAccountBalance(account1);

				const targetAmount = toUnit(2000);
				// revoke
				// method in PublicEST.sol
				const tx = await mockedSynthetix.revokeFrom(e.address, account1, account3, targetAmount, 0);

				// Check user has the 0 vested SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(account1), 0);

				// Check recipient contract has same amount of SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(account3), accountEscrowedBalanceBefore);

				const vestingEntryAfter = await e.getVestingEntry(account1, firstEntryId);

				// same total escrowed balance
				assert.bnEqual(await e.totalEscrowedBalance(), 0);

				// same user totalEscrowedAccountBalance
				assert.bnEqual(await e.totalEscrowedAccountBalance(account1), 0);

				// user totalVestedAccountBalance is same
				assert.bnEqual(await e.totalVestedAccountBalance(account1), 0);

				// escrow amount still same on entry
				assert.bnEqual(vestingEntryAfter.escrowAmount, 0);

				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [e],
				});

				// only Revoked event
				decodedEventEqual({
					event: 'Revoked',
					emittedFrom: e.address,
					args: [account1, account3, targetAmount, 0, 1],
					log: logs.filter(l => !!l).find(({ name }) => name === 'Revoked'),
				});
			}
		);

		assertWithFallback(
			'should revoke and transfer SNX to recipient for partial amount',
			async (e, s) => {
				const escrowBalanceBefore = await mockedSynthetix.balanceOf(e.address);
				const accountEscrowedBalanceBefore = await e.totalEscrowedAccountBalance(account1);

				const targetAmount = toUnit(1);

				// revoke
				// method in PublicEST.sol
				const tx = await mockedSynthetix.revokeFrom(e.address, account1, account3, targetAmount, 0);

				// Check user has the 0 vested SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(account1), 0);

				// Check recipient contract has correct amount of SNX
				assert.bnEqual(await mockedSynthetix.balanceOf(account3), targetAmount);

				// total escrowed balance
				assert.bnEqual(await e.totalEscrowedBalance(), escrowBalanceBefore.sub(targetAmount));

				// user totalEscrowedAccountBalance
				assert.bnEqual(
					await e.totalEscrowedAccountBalance(account1),
					accountEscrowedBalanceBefore.sub(targetAmount)
				);

				const vestingEntryAfter = await e.getVestingEntry(account1, firstEntryId);
				const secondVestingEntryAfter = await e.getVestingEntry(
					account1,
					firstEntryId.add(new BN(1))
				);
				const thirdEntryID = firstEntryId.add(new BN(2));
				const thirdVestingEntryAfter = await e.getVestingEntry(account1, thirdEntryID);

				// first entry is zero
				assert.bnEqual(vestingEntryAfter.escrowAmount, 0);
				// second entru unchanged
				assert.bnEqual(secondVestingEntryAfter.escrowAmount, escrowAmount);
				// third entry created
				assert.bnEqual(thirdVestingEntryAfter.escrowAmount, escrowAmount.sub(targetAmount));

				// check events
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [e],
				});

				// VestingEntryCreated event for the refunf
				const timestamp = await currentTime();
				decodedEventEqual({
					event: 'VestingEntryCreated',
					emittedFrom: e.address,
					args: [
						account1,
						timestamp,
						escrowAmount.sub(targetAmount),
						thirdVestingEntryAfter.endTime - timestamp,
						thirdEntryID,
					],
					log: logs.filter(l => !!l).find(({ name }) => name === 'VestingEntryCreated'),
				});

				// Revoked event
				decodedEventEqual({
					event: 'Revoked',
					emittedFrom: e.address,
					args: [account1, account3, targetAmount, 0, 1],
					log: logs.filter(l => !!l).find(({ name }) => name === 'Revoked'),
				});
			}
		);

		assertWithFallback('should use startIndex', async (e, s) => {
			const escrowBalanceBefore = await mockedSynthetix.balanceOf(e.address);
			const accountEscrowedBalanceBefore = await e.totalEscrowedAccountBalance(account1);

			const targetAmount = toUnit(1);

			// revoke
			// method in PublicEST.sol
			const tx = await mockedSynthetix.revokeFrom(e.address, account1, account3, targetAmount, 1);

			// Check user has the 0 vested SNX
			assert.bnEqual(await mockedSynthetix.balanceOf(account1), 0);

			// Check recipient contract has correct amount of SNX
			assert.bnEqual(await mockedSynthetix.balanceOf(account3), targetAmount);

			// total escrowed balance
			assert.bnEqual(await e.totalEscrowedBalance(), escrowBalanceBefore.sub(targetAmount));

			// user totalEscrowedAccountBalance
			assert.bnEqual(
				await e.totalEscrowedAccountBalance(account1),
				accountEscrowedBalanceBefore.sub(targetAmount)
			);

			const vestingEntryAfter = await e.getVestingEntry(account1, firstEntryId);
			const secondVestingEntryAfter = await e.getVestingEntry(
				account1,
				firstEntryId.add(new BN(1))
			);
			const thirdVestingEntryAfter = await e.getVestingEntry(account1, firstEntryId.add(new BN(2)));

			// first entry unchanged
			assert.bnEqual(vestingEntryAfter.escrowAmount, escrowAmount);
			assert.bnEqual(secondVestingEntryAfter.escrowAmount, 0);
			assert.bnEqual(thirdVestingEntryAfter.escrowAmount, escrowAmount.sub(targetAmount));

			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [e],
			});

			decodedEventEqual({
				event: 'Revoked',
				emittedFrom: e.address,
				args: [account1, account3, targetAmount, 1, 2],
				log: logs.filter(l => !!l).find(({ name }) => name === 'Revoked'),
			});
		});
	});

	describe('Read Vesting Schedule', () => {
		const duration = 1 * YEAR;
		const escrowAmounts = [toUnit('200'), toUnit('300'), toUnit('500')];
		let entryID1, entryID2, entryID3;
		beforeEach(async () => {
			// Transfer of SNX to the escrow must occur before creating a vestinng entry
			mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('1000'));

			// Add a few vesting entries as the feepool address
			entryID1 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmounts[0], duration, {
				from: feePoolAccount,
			});
			await fastForward(WEEK);
			entryID2 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmounts[1], duration, {
				from: feePoolAccount,
			});
			await fastForward(WEEK);
			entryID3 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmounts[2], duration, {
				from: feePoolAccount,
			});

			// ensure Issuer.debtBalanceOf returns 0
			mocks['Issuer'].smocked.debtBalanceOf.will.return.with('0');
		});
		assertWithFallback('should return the vesting schedules for account1', async e => {
			const entries = await e.getVestingSchedules(account1, 0, 3);
			// should be 3 entries
			assert.equal(entries.length, 3);

			// escrowAmounts should match for the entries in order
			entries.forEach((entry, i) => {
				assert.bnEqual(entry.escrowAmount, escrowAmounts[i]);
				assert.bnEqual(entry.entryID, i + 1);
			});
		});
		assertWithFallback('should return the list of vesting entryIDs for account1', async e => {
			const vestingEntryIDs = await e.getAccountVestingEntryIDs(account1, 0, 3);

			// should be 3 entries
			assert.equal(vestingEntryIDs.length, 3);

			assert.bnEqual(vestingEntryIDs[0], entryID1);
			assert.bnEqual(vestingEntryIDs[1], entryID2);
			assert.bnEqual(vestingEntryIDs[2], entryID3);
		});
	});

	describe('Stress test - Read Vesting Schedule', () => {
		const duration = 1 * YEAR;
		const escrowAmount = toUnit(1);
		const numberOfEntries = 260; // 5 years of entries
		beforeEach(async () => {
			// Transfer of SNX to the escrow must occur before creating a vestinng entry
			mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('1000'));

			// add a 260 escrow entries
			for (var i = 0; i < numberOfEntries; i++) {
				await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
					from: feePoolAccount,
				});
			}

			// ensure Issuer.debtBalanceOf returns 0
			mocks['Issuer'].smocked.debtBalanceOf.will.return.with('0');
		});
		assertWithFallback('should return the vesting schedules for account1', async e => {
			const entries = await e.getVestingSchedules(account1, 0, numberOfEntries);
			// should be 260 entries
			assert.equal(entries.length, numberOfEntries);
		});
		assertWithFallback('should return the list of vesting entryIDs for account1', async e => {
			const vestingEntryIDs = await e.getAccountVestingEntryIDs(account1, 0, numberOfEntries);

			// should be 260 entryID's in the list
			assert.equal(vestingEntryIDs.length, numberOfEntries);
		});
		assertWithFallback('should return a subset of vesting entryIDs for account1', async e => {
			const vestingEntryIDs = await e.getAccountVestingEntryIDs(account1, 130, numberOfEntries);

			// should be 130 entryID's in the list
			assert.equal(vestingEntryIDs.length, 130);
		});
	});

	describe('Vesting Schedule merging', () => {
		const duration = 1 * YEAR;
		let escrowAmount1,
			escrowAmount2,
			escrowAmount3,
			entryID1,
			entryID2,
			entryID3,
			entryID4,
			entryID5,
			entryID6;

		beforeEach(async () => {
			// Transfer of SNX to the escrow must occur before creating a vestinng entry
			mocks['Synthetix'].smocked.balanceOf.will.return.with(parseEther('1000'));

			escrowAmount1 = toUnit('200');
			escrowAmount2 = toUnit('300');
			escrowAmount3 = toUnit('500');

			// Add a few vesting entries as the feepool address
			entryID1 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount1, duration, {
				from: feePoolAccount,
			});
			await fastForward(WEEK);
			entryID2 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount2, duration, {
				from: feePoolAccount,
			});
			await fastForward(WEEK);
			entryID3 = await baseRewardEscrowV2.nextEntryId();
			await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount3, duration, {
				from: feePoolAccount,
			});

			// ensure Issuer.debtBalanceOf returns 0
			mocks['Issuer'].smocked.debtBalanceOf.will.return.with('0');
		});

		it('user should have three vesting entries', async () => {
			assert.bnEqual(await baseRewardEscrowV2.numVestingEntries(account1), new BN(3));

			// check accountVestingEntryIDs match the entryIDs
			assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account1, 0), entryID1);
			assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account1, 1), entryID2);
			assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account1, 2), entryID3);
		});
		it('initially account merging is not open', async () => {
			assert.isFalse(await baseRewardEscrowV2.accountMergingIsOpen());
		});

		it('should have no nominated address for account1 initially', async () => {
			assert.equal(await baseRewardEscrowV2.nominatedReceiver(account1), ZERO_ADDRESS);
		});

		it('should revert nominating and merging when account merging has not started', async () => {
			await assert.revert(
				baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 }),
				'Account merging has ended'
			);
		});

		describe('when account merging window is open', () => {
			beforeEach(async () => {
				await baseRewardEscrowV2.startMergingWindow({ from: owner });
			});
			it('should revert when account is not nominated to merge another', async () => {
				await assert.revert(
					baseRewardEscrowV2.mergeAccount(account1, [entryID1], { from: account2 }),
					'Address is not nominated to merge'
				);
			});

			it('reverts when user nominating has any debt balance', async () => {
				mocks['Issuer'].smocked.debtBalanceOf.will.return.with('1');

				await assert.revert(
					baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 }),
					'Cannot merge accounts with debt'
				);

				// Revert when merging account if the accountToMerge now has debt
				await assert.revert(
					baseRewardEscrowV2.mergeAccount(account1, [entryID1], { from: account2 }),
					'Cannot merge accounts with debt'
				);
			});

			it('reverts when user nominating their own address', async () => {
				await assert.revert(
					baseRewardEscrowV2.nominateAccountToMerge(account1, { from: account1 }),
					'Cannot nominate own account to merge'
				);
			});

			it('should allow account to nominate another destination account', async () => {
				await baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 });

				assert.equal(await baseRewardEscrowV2.nominatedReceiver(account1), account2);
			});

			it('should allow account to nominate destination account as zero address', async () => {
				await baseRewardEscrowV2.nominateAccountToMerge(ZERO_ADDRESS, { from: account1 });

				assert.equal(await baseRewardEscrowV2.nominatedReceiver(account1), ZERO_ADDRESS);
			});

			it('should emit an event on nominating a destination account', async () => {
				const tx = await baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 });

				// NominateAccountToMerge(msg.sender, account);
				const nominatedEvent = tx.logs.find(log => log.event === 'NominateAccountToMerge');
				assert.eventEqual(nominatedEvent, 'NominateAccountToMerge', {
					account: account1,
					destination: account2,
				});
			});

			it('should revert nominating and merging when account merging has ended', async () => {
				const accountMergingDuration = await baseRewardEscrowV2.accountMergingDuration();

				// fast forward after merging duration
				await fastForward(accountMergingDuration + 1);

				await assert.revert(
					baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 }),
					'Account merging has ended'
				);
			});

			describe('when given 1 entryID to merge from account1 into account2', () => {
				let account1BalanceBefore;
				let account2BalanceBefore;
				let totalEscrowedBalanceBefore;
				let entry1;
				beforeEach(async () => {
					// check account 1 totalEscrowedAccountBalance before
					account1BalanceBefore = await baseRewardEscrowV2.totalEscrowedAccountBalance(account1);

					totalEscrowedBalanceBefore = await baseRewardEscrowV2.totalEscrowedBalance();

					entry1 = await baseRewardEscrowV2.getVestingEntry(account1, entryID1);

					// nominate account 2 as destination
					await baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 });

					// check account 2 has no totalEscrowedAccountBalance before
					account2BalanceBefore = await baseRewardEscrowV2.totalEscrowedAccountBalance(account2);
					assert.bnEqual(account2BalanceBefore, 0);

					// new ID
					entryID4 = await baseRewardEscrowV2.nextEntryId();
					// merge entryID1 to account 2
					await baseRewardEscrowV2.mergeAccount(account1, [entryID1], { from: account2 });
				});

				it('should merge entry1 into account 2', async () => {
					// account 2 totalEscrowedAccountBalance should be increased by entryID1 escrowAmount
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account2),
						entry1.escrowAmount
					);

					// account 1 totalEscrowedAccountBalance should be less entryID1 escrowAmount
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account1),
						account1BalanceBefore.sub(entry1.escrowAmount)
					);

					// account1's entry for entryID1 should be 0 (not set)
					const entry1After = await baseRewardEscrowV2.getVestingEntry(account1, entryID1);
					assert.bnEqual(entry1After.escrowAmount, 0);
				});

				it('should have the same contract totalEscrowedBalance before and after', async () => {
					// totalEscrowedBalanceBefore is same before and after
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedBalance(),
						totalEscrowedBalanceBefore
					);
				});

				it('should be able to get entry4 from account 2 vestingSchedule', async () => {
					const entry4OnAccount2 = await baseRewardEscrowV2.getVestingEntry(account2, entryID4);
					assert.bnEqual(entry4OnAccount2.endTime, entry1.endTime);
					assert.bnEqual(entry4OnAccount2.escrowAmount, entry1.escrowAmount);
				});

				it('should have added the entryID to account2 accountVestingEntryIDs', async () => {
					assert.bnEqual(await baseRewardEscrowV2.numVestingEntries(account2), new BN(1));
					assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account2, 0), entryID4);
				});

				it('should ignore merging entryID1 again from account1 as the entry is no longer set', async () => {
					// record acc2, acc1 totalEscrowedAccountBalance before 2nd attempt
					const totalEscrowedBalanceAcc2 = await baseRewardEscrowV2.totalEscrowedAccountBalance(
						account2
					);
					const totalEscrowedBalanceAcc1 = await baseRewardEscrowV2.totalEscrowedAccountBalance(
						account1
					);

					const numVestingEntriesBefore = await baseRewardEscrowV2.numVestingEntries(account2);

					// merge entryID1 to account 2
					await baseRewardEscrowV2.mergeAccount(account1, [entryID1], { from: account2 });

					// totalEscrowedBalance should still be the same as before
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account2),
						totalEscrowedBalanceAcc2
					);

					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account1),
						totalEscrowedBalanceAcc1
					);

					// no new entryID's appended to account2's accountVestingEntryIDs
					assert.bnEqual(
						await baseRewardEscrowV2.numVestingEntries(account2),
						numVestingEntriesBefore
					);
				});
			});

			describe('when merging multiple vesting entries from account 1 to account 2', () => {
				let account1BalanceBefore;
				let account2BalanceBefore;
				let totalEscrowedBalanceBefore;
				let entry1;
				let entry2;
				beforeEach(async () => {
					// check account 1 totalEscrowedAccountBalance before
					account1BalanceBefore = await baseRewardEscrowV2.totalEscrowedAccountBalance(account1);

					totalEscrowedBalanceBefore = await baseRewardEscrowV2.totalEscrowedBalance();

					entry1 = await baseRewardEscrowV2.getVestingEntry(account1, entryID1);
					entry2 = await baseRewardEscrowV2.getVestingEntry(account1, entryID2);

					// nominate account 2 as destination
					await baseRewardEscrowV2.nominateAccountToMerge(account2, { from: account1 });

					// check account 2 has no totalEscrowedAccountBalance before
					account2BalanceBefore = await baseRewardEscrowV2.totalEscrowedAccountBalance(account2);
					assert.bnEqual(account2BalanceBefore, 0);

					// merge entryID1, entryID2 to account 2
					// new IDs
					entryID5 = await baseRewardEscrowV2.nextEntryId();
					entryID6 = entryID5.add(new BN(1));
					await baseRewardEscrowV2.mergeAccount(account1, [entryID1, entryID2], { from: account2 });
				});
				it('should merge entry1, entry2 into account 2', async () => {
					const combinedEscrowedAmounts = entry1.escrowAmount.add(entry2.escrowAmount);

					// account 2 totalEscrowedAccountBalance should be increased by entryID1 & entryID2 remainingAmount
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account2),
						account2BalanceBefore.add(combinedEscrowedAmounts)
					);

					// account 1 totalEscrowedAccountBalance should be less entryID1 & entryID2 remainingAmount
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedAccountBalance(account1),
						account1BalanceBefore.sub(combinedEscrowedAmounts)
					);

					// account1's entry for entryID1 should be 0 (not set)
					const entry1After = await baseRewardEscrowV2.getVestingEntry(account1, entryID1);
					assert.bnEqual(entry1After.escrowAmount, 0);
					assert.bnEqual(entry1After.endTime, entry1.endTime); // time remains as before

					// account1's entry for entryID2 should be 0 (not set)
					const entry2After = await baseRewardEscrowV2.getVestingEntry(account1, entryID2);
					assert.bnEqual(entry2After.escrowAmount, 0);
					assert.bnEqual(entry2After.endTime, entry2.endTime); // time remains as before
				});
				it('should have the same totalEscrowedBalance on escrow contract before and after', async () => {
					// totalEscrowedBalanceBefore is same before and after
					assert.bnEqual(
						await baseRewardEscrowV2.totalEscrowedBalance(),
						totalEscrowedBalanceBefore
					);
				});
				it('should be able to get entry5 from account 2 vestingSchedule', async () => {
					const entry5OnAccount2 = await baseRewardEscrowV2.getVestingEntry(account2, entryID5);
					assert.bnEqual(entry5OnAccount2.endTime, entry1.endTime);
					assert.bnEqual(entry5OnAccount2.escrowAmount, entry1.escrowAmount);
				});
				it('should be able to get entry6 from account 2 vestingSchedule', async () => {
					const entry6OnAccount2 = await baseRewardEscrowV2.getVestingEntry(account2, entryID6);
					assert.bnEqual(entry6OnAccount2.endTime, entry2.endTime);
					assert.bnEqual(entry6OnAccount2.escrowAmount, entry2.escrowAmount);
				});
				it('should have added the entryIDs to account2 accountVestingEntryIDs', async () => {
					assert.bnEqual(await baseRewardEscrowV2.numVestingEntries(account2), new BN(2));
					assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account2, 0), entryID5);
					assert.bnEqual(await baseRewardEscrowV2.accountVestingEntryIDs(account2, 1), entryID6);
				});
			});
		});
	});
});
