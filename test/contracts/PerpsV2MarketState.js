const { contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { toBytes32 } = require('../..');
const { setupContract } = require('./setup');
const { assert } = require('./common');

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const marketKey = toBytes32('sETH-perps');
const baseAsset = toBytes32('sETH');

contract('PerpsV2MarketState', accounts => {
	let futuresMarketState, mockPerpsV2StateConsumer;

	const owner = accounts[1];
	const user = accounts[2];
	const user2 = accounts[3];

	beforeEach(async () => {
		futuresMarketState = await setupContract({
			accounts,
			contract: 'PerpsV2MarketState',
			args: [owner, [owner], baseAsset, marketKey],
			skipPostDeploy: true,
		});

		mockPerpsV2StateConsumer = await setupContract({
			accounts,
			contract: 'MockPerpsV2StateConsumer',
			args: [futuresMarketState.address],
			skipPostDeploy: true,
		});

		await futuresMarketState.removeAssociatedContracts([owner], {
			from: owner,
		});

		await futuresMarketState.addAssociatedContracts([mockPerpsV2StateConsumer.address], {
			from: owner,
		});
	});

	describe('Basic parameters', () => {
		it('Only expected functions are mutative PerpsV2MarketState', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: futuresMarketState.abi,
				ignoreParents: ['Owned', 'StateShared'],
				expected: [
					'setBaseAsset',
					'setMarketKey',
					'setMarketSize',
					'setMarketSkew',
					'setEntryDebtCorrection',
					'setNextPositionId',
					'setFundingLastRecomputed',
					'setFundingRateLastRecomputed',
					'pushFundingSequence',
					'updateDelayedOrder',
					'updatePosition',
					'deleteDelayedOrder',
					'deletePosition',
				],
			});
		});

		it('Only associate functions cannot be called by unauthorized contracts/accounts', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setMarketKey,
				args: [toBytes32('newMarketKey')],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setBaseAsset,
				args: [toBytes32('newBaseAsset')],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setMarketSize,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setEntryDebtCorrection,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setNextPositionId,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setMarketSkew,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.setFundingLastRecomputed,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.pushFundingSequence,
				args: [1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.updatePosition,
				args: [user, 1, 1, 1, 1, 1],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.updateDelayedOrder,
				args: [user, false, 1, 1, 1, 1, 1, 1, 1, toBytes32('code')],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.deletePosition,
				args: [user],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketState.deleteDelayedOrder,
				args: [user],
				accounts: [owner, user],
				reason: 'Only an associated contract can perform this action',
				skipPassCheck: true,
			});
		});
	});

	describe('Update and read values', () => {
		async function updateAndCheckSingleParameter(
			paramName,
			singleParameter,
			readBy,
			marketStateContract = futuresMarketState,
			marketStateConsumer = mockPerpsV2StateConsumer
		) {
			await marketStateConsumer['set' + paramName.charAt(0).toUpperCase() + paramName.slice(1)](
				singleParameter
			);

			const readValue = await marketStateContract[paramName]({
				from: readBy,
			});
			assert.equal(readValue.toString(), singleParameter.toString());
		}

		it('reverts attempting to set a new marketKey', async () => {
			await assert.revert(
				mockPerpsV2StateConsumer.setMarketKey(toBytes32('changeValue')),
				'Cannot change market key'
			);
		});

		it('reverts attempting to set a new baseAsset', async () => {
			await assert.revert(
				mockPerpsV2StateConsumer.setBaseAsset(toBytes32('changeValue')),
				'Cannot change base asset'
			);
		});

		it('update and read single parameters', async () => {
			assert.equal(await futuresMarketState.marketKey(), marketKey);
			assert.equal(await futuresMarketState.baseAsset(), baseAsset);
			await updateAndCheckSingleParameter('marketSize', 42, user);
			await updateAndCheckSingleParameter('entryDebtCorrection', 43, user);
			await updateAndCheckSingleParameter('nextPositionId', 44, user);
			await updateAndCheckSingleParameter('marketSkew', 45, user);
			await updateAndCheckSingleParameter('fundingLastRecomputed', 46, user);
			await updateAndCheckSingleParameter('fundingRateLastRecomputed', 47, user);
		});

		it('push funding sequence', async () => {
			const previousFundingSequenceLength = await futuresMarketState.fundingSequenceLength();
			await mockPerpsV2StateConsumer.pushFundingSequence(100);

			assert.bnEqual(
				await futuresMarketState.fundingSequenceLength(),
				previousFundingSequenceLength.add(toBN(1))
			);

			assert.bnEqual(
				await futuresMarketState.fundingSequence(previousFundingSequenceLength),
				toBN(100)
			);
		});

		it('updates a Position', async () => {
			assert.bnEqual((await futuresMarketState.positions(user2)).id, 0);
			await mockPerpsV2StateConsumer.updatePosition(user2, 42, 2, 3, 4, 5);
			assert.bnEqual((await futuresMarketState.positions(user2)).id, 42);
		});

		it('deletes a Position', async () => {
			await mockPerpsV2StateConsumer.updatePosition(user2, 1337, 2, 3, 4, 5);
			assert.bnEqual((await futuresMarketState.positions(user2)).id, 1337);
			await mockPerpsV2StateConsumer.deletePosition(user2);
			assert.bnEqual((await futuresMarketState.positions(user2)).id, 0);
		});

		it('updates a DelayedOrder', async () => {
			assert.bnEqual((await futuresMarketState.delayedOrders(user2)).sizeDelta, 0);
			await mockPerpsV2StateConsumer.updateDelayedOrder(
				user2,
				true,
				42,
				2,
				3,
				4,
				5,
				6,
				7,
				toBytes32('code')
			);
			assert.bnEqual((await futuresMarketState.delayedOrders(user2)).sizeDelta, 42);
		});

		it('deletes a DelayedOrder', async () => {
			await mockPerpsV2StateConsumer.updateDelayedOrder(
				user2,
				true,
				1337,
				2,
				3,
				4,
				5,
				6,
				7,
				toBytes32('code')
			);
			assert.bnEqual((await futuresMarketState.delayedOrders(user2)).sizeDelta, 1337);
			await mockPerpsV2StateConsumer.deleteDelayedOrder(user2);
			assert.bnEqual((await futuresMarketState.delayedOrders(user2)).sizeDelta, 0);
		});

		describe('can set marketKey and baseAsset if unset', () => {
			let anotherFuturesMarketState, anotherMarketStateConsumer;
			beforeEach('setup new unset contracts', async () => {
				anotherFuturesMarketState = await setupContract({
					accounts,
					contract: 'PerpsV2MarketState',
					args: [owner, [owner], toBytes32(''), toBytes32('')],
					skipPostDeploy: true,
				});

				anotherMarketStateConsumer = await setupContract({
					accounts,
					contract: 'MockPerpsV2StateConsumer',
					args: [anotherFuturesMarketState.address],
					skipPostDeploy: true,
				});

				await anotherFuturesMarketState.removeAssociatedContracts([owner], {
					from: owner,
				});

				await anotherFuturesMarketState.addAssociatedContracts(
					[anotherMarketStateConsumer.address],
					{
						from: owner,
					}
				);
			});

			it('can set the marketKey if unset', async () => {
				await updateAndCheckSingleParameter(
					'marketKey',
					toBytes32('someFancyMarketKey'),
					user,
					anotherFuturesMarketState,
					anotherMarketStateConsumer
				);
			});

			it('can set the baseAsset if unset', async () => {
				await updateAndCheckSingleParameter(
					'baseAsset',
					toBytes32('someFancyBaseAsset'),
					user,
					anotherFuturesMarketState,
					anotherMarketStateConsumer
				);
			});
		});
	});

	describe('Migration helper', () => {
		const positionAddresses = [];
		const delayedOrderAddresses = [];

		beforeEach('add some positions and delayed orders', async () => {
			for (let i = 0; i < 100; i++) {
				const newAddress = web3.eth.accounts.create();
				positionAddresses[i] = newAddress.address;
				await mockPerpsV2StateConsumer.updatePosition(newAddress.address, i, 2, 3, 4, 5);
			}

			for (let i = 0; i < 50; i++) {
				const newAddress = web3.eth.accounts.create();
				delayedOrderAddresses[i] = newAddress.address;
				await mockPerpsV2StateConsumer.updateDelayedOrder(
					newAddress.address,
					true,
					i,
					2,
					3,
					4,
					5,
					6,
					7,
					toBytes32('code')
				);
			}
		});

		it('can retrieve paged positions addresses length', async () => {
			assert.bnEqual(await mockPerpsV2StateConsumer.getPositionAddressesLength(), toBN(100));
		});

		it('can retrieve paged delayed orders addresses length', async () => {
			assert.bnEqual(await mockPerpsV2StateConsumer.getDelayedOrderAddressesLength(), toBN(50));
		});

		it('can retrieve paged positions addresses', async () => {
			const addresses = await mockPerpsV2StateConsumer.getPositionAddressesPage(0, 100);
			assert.deepEqual(addresses, positionAddresses);
		});
		it('can retrieve paged delayed orders addresses', async () => {
			const addresses = await mockPerpsV2StateConsumer.getDelayedOrderAddressesPage(0, 50);
			assert.deepEqual(addresses, delayedOrderAddresses);
		});
	});
});
