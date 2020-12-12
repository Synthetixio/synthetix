const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { getSource, getTarget } = require('../..');

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';
// const DATA_PROVIDER_URL = 'http://localhost:8080';

// These addresses are set up by optimism-integration in the local chains.
// See publish/src/commands/deploy-ovm-pair.js
const OWNER_ADDRESS = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
const USER1_PRIVATE_KEY = '0x5b1c2653250e5c580dcb4e51c2944455e144c57ebd6a0645bd359d2e69ca0f0c';
const USER1_ADDRESS = '0x5eeabfdd0f31cebf32f8abf22da451fe46eac131';

const SECOND = 1000;
const MINUTE = SECOND * 60;

describe('Layer 2 production tests', () => {
	let providerL1, providerL2;

	let ownerL1, user1L1, user1L2;
	// let ownerL1, ownerL2, user1L1, user1L2;

	let FeePoolL1, RewardEscrowV2L1, SynthetixBridgeToOptimismL1, SynthetixL1;
	let RewardEscrowV2L2, SynthetixBridgeToBaseL2;

	// const zero = ethers.utils.parseEther('0');

	const cache = {
		bridge: {
			l1: { balance: 0 },
			l2: { balance: 0 },
		},
		user1: {
			l1: { balance: 0 },
			l2: { balance: 0 },
		},
	};

	function connectContract({ contract, source = contract, useOvm = false }) {
		const params = {
			path,
			fs,
			network: 'local',
			useOvm,
		};

		return new ethers.Contract(
			getTarget({ ...params, contract }).address,
			getSource({ ...params, contract: source }).abi,
			useOvm ? providerL2 : providerL1
		);
	}

	async function wait(seconds) {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, seconds * 1000);
		});
	}

	async function fastForward(seconds, provider) {
		await provider.send('evm_increaseTime', [seconds]);

		await provider.send('evm_mine', []);
	}

	before('set up providers', () => {
		providerL1 = new ethers.providers.JsonRpcProvider(L1_PROVIDER_URL);
		providerL2 = new ethers.providers.JsonRpcProvider(L2_PROVIDER_URL);
	});

	before('set up signers', () => {
		ownerL1 = providerL1.getSigner(OWNER_ADDRESS);
		// ownerL2 = providerL2.getSigner(OWNER_ADDRESS);
		user1L1 = providerL1.getSigner(USER1_ADDRESS);
		user1L2 = new ethers.Wallet(USER1_PRIVATE_KEY, providerL2);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix' });
			FeePoolL1 = connectContract({ contract: 'FeePool' });
			RewardEscrowV2L1 = connectContract({ contract: 'RewardEscrowV2' });
			RewardEscrowV2L2 = connectContract({
				contract: 'RewardEscrowV2',
				source: 'ImportableRewardEscrowV2',
				useOvm: true,
			});
			SynthetixBridgeToOptimismL1 = connectContract({ contract: 'SynthetixBridgeToOptimism' });
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
			});
		});

		it('shows the expected owners', async () => {
			assert.equal(await RewardEscrowV2L1.owner(), OWNER_ADDRESS);
			assert.equal(await RewardEscrowV2L2.owner(), OWNER_ADDRESS);
		});

		it('the initial values are the expected ones', async () => {
			assert.equal(await RewardEscrowV2L1.numVestingEntries(USER1_ADDRESS), 0);
			assert.equal(await RewardEscrowV2L1.totalEscrowedAccountBalance(USER1_ADDRESS), 0);
			assert.equal(await RewardEscrowV2L1.totalVestedAccountBalance(USER1_ADDRESS), 0);
		});

		describe('when the rewardEscrowV2 contract owns enough SNX', () => {
			const snxAmount = ethers.utils.parseEther('100');

			before('transfer SNX to rewardEscrowV2', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(RewardEscrowV2L1.address, snxAmount, {
					from: owner,
				});
			});

			it('updates the contract balance', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(RewardEscrowV2L1.address),
					snxAmount
				);
			});

		describe('when the user has 52 vesting entries', () => {
			const escrowEntryAmount = ethers.utils.parseEther('1');
			const duration = MINUTE;
			let nextEntryIdAfter;
			before('connect to contracts', async () => {
				const escrowAmount = ethers.utils.parseEther('1');

				// Append vesting entry
				await FeePoolL1.appendVestingEntry(USER1_ADDRESS, escrowEntryAmount, duration, {
					from: ownerL1,
				});
				nextEntryIdAfter = await baseRewardEscrowV2.nextEntryId();
			});

			

			it('Should return the vesting entry for account 1 and entryID', async () => {
				const vestingEntry = await baseRewardEscrowV2.getVestingEntry(account1, entryID);

				// endTime is 1 year after
				assert.isTrue(vestingEntry.endTime.gte(now + duration));

				// escrowAmount is 10
				assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);

				// remainingAmount is 10
				assert.bnEqual(vestingEntry.remainingAmount, escrowAmount);

				// duration is 1 year
				assert.bnEqual(vestingEntry.duration, duration);

				// last vested timestamp is 0
				assert.bnEqual(vestingEntry.lastVested, new BN(0));
			});
			
			it('Should increment the nextEntryID', async () => {
				assert.bnEqual(nextEntryIdAfter, entryID.add(new BN(1)));
			});
		});
	});
});
