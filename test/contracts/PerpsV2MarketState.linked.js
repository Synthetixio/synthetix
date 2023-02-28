const { contract, web3 } = require('hardhat');
const { toUnit } = require('../utils')();
const { toBytes32, constants } = require('../..');
const { setupContract } = require('./setup');
const { assert } = require('./common');

// const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const marketKey = toBytes32('sETH-perps');
const baseAsset = toBytes32('sETH');

const generateFakeActivity = ({
	fundingSequenceItemsCount,
	positionsCount,
	delayedOrdersCount,
	positionsIdOffset = 1,
	positionsFundingIdxOffset = 1,
}) => {
	const getRandomInt = max => {
		return Math.floor(Math.random() * max);
	};

	const getRandomUnitBN = (min, max) => {
		return toUnit(Math.floor((Math.random() * (max - min) + min) * 10000) / 10000);
	};

	const getRandomAddress = () => {
		return web3.eth.accounts.create().address;
	};

	const fundingSequenceItems = [];
	for (let i = 0; i < fundingSequenceItemsCount; i++) {
		fundingSequenceItems.push(getRandomUnitBN(-10000, 10000));
	}

	const positions = [];
	for (let i = 0; i < positionsCount; i++) {
		positions.push({
			address: getRandomAddress(),
			data: {
				id: positionsIdOffset + i,
				lastFundingIndex: positionsFundingIdxOffset + i,
				margin: getRandomUnitBN(10000, 20000),
				lastPrice: getRandomUnitBN(1000, 2000),
				size: getRandomUnitBN(-20, 20),
			},
		});
	}

	const delayedOrders = [];
	for (let i = 0; i < delayedOrdersCount; i++) {
		delayedOrders.push({
			address: getRandomAddress(),
			data: {
				isOffchain: getRandomInt(2) === 1,
				sizeDelta: getRandomUnitBN(-10, 10),
				priceImpactDelta: toUnit('.05'),
				targetRoundId: getRandomInt(100),
				commitDeposit: getRandomUnitBN(0, 10),
				keeperDeposit: getRandomUnitBN(0, 10),
				executableAtTime: 1677550000 + getRandomInt(100),
				intentionTime: 1677550000 + getRandomInt(100),
				trackingCode: `code${getRandomInt(100)}`,
			},
		});
	}
	return { fundingSequenceItems, positions, delayedOrders };
};

const addActivity = async ({
	user,
	marketStateOrConsumer,
	fundingSequenceItems,
	positions,
	delayedOrders,
}) => {
	for (const fundingSequenceItem of fundingSequenceItems) {
		await marketStateOrConsumer.pushFundingSequence(fundingSequenceItem, {
			from: user,
		});
	}

	for (const position of positions) {
		await marketStateOrConsumer.updatePosition(
			position.address,
			position.data.id,
			position.data.lastFundingIndex,
			position.data.margin,
			position.data.lastPrice,
			position.data.size,
			{
				from: user,
			}
		);
	}

	for (const delayedOrder of delayedOrders) {
		await marketStateOrConsumer.updateDelayedOrder(
			delayedOrder.address,
			delayedOrder.data.isOffchain,
			delayedOrder.data.sizeDelta,
			delayedOrder.data.priceImpactDelta,
			delayedOrder.data.targetRoundId,
			delayedOrder.data.commitDeposit,
			delayedOrder.data.keeperDeposit,
			delayedOrder.data.executableAtTime,
			delayedOrder.data.intentionTime,

			toBytes32(delayedOrder.data.trackingCode),
			{
				from: user,
			}
		);
	}
};

const retrieveAndVerifyData = async ({
	marketStateOrConsumer,
	fundingSequenceItems,
	positions,
	delayedOrders,
}) => {
	for (let i = 0; i < fundingSequenceItems.length; i++) {
		// funding sequence 0 is unused, we start at 1... duh
		assert.bnEqual(await marketStateOrConsumer.fundingSequence(i + 1), fundingSequenceItems[i]);
	}

	for (let i = 0; i < positions.length; i++) {
		const position = await marketStateOrConsumer.positions(positions[i].address);
		assert.bnEqual(position.id, positions[i].data.id);
		assert.bnEqual(position.lastFundingIndex, positions[i].data.lastFundingIndex);
		assert.bnEqual(position.margin, positions[i].data.margin);
		assert.bnEqual(position.lastPrice, positions[i].data.lastPrice);
		assert.bnEqual(position.size, positions[i].data.size);
	}

	for (let i = 0; i < delayedOrders.length; i++) {
		const delayedOrder = await marketStateOrConsumer.delayedOrders(delayedOrders[i].address);
		assert.equal(delayedOrder.isOffchain, delayedOrders[i].data.isOffchain);
		assert.bnEqual(delayedOrder.sizeDelta, delayedOrders[i].data.sizeDelta);
		assert.bnEqual(delayedOrder.priceImpactDelta, delayedOrders[i].data.priceImpactDelta);
		assert.bnEqual(delayedOrder.targetRoundId, delayedOrders[i].data.targetRoundId);
		assert.bnEqual(delayedOrder.commitDeposit, delayedOrders[i].data.commitDeposit);
		assert.bnEqual(delayedOrder.keeperDeposit, delayedOrders[i].data.keeperDeposit);
		assert.bnEqual(delayedOrder.executableAtTime, delayedOrders[i].data.executableAtTime);
		assert.bnEqual(delayedOrder.intentionTime, delayedOrders[i].data.intentionTime);
		assert.equal(delayedOrder.trackingCode, toBytes32(delayedOrders[i].data.trackingCode));
	}
};

const testBehaviour = ({
	accounts,
	owner,
	user,
	fundingSequenceItemsCount,
	positionsCount,
	delayedOrdersCount,
}) => {
	let generatedActivity;
	let legacyPerpsV2MarketState;

	const getAndLinkContracts = async legacyPerpsV2MarketState => {
		const perpsV2MarketState = await setupContract({
			accounts,
			contract: 'PerpsV2MarketState',
			args: [
				owner,
				[owner],
				baseAsset,
				marketKey,
				legacyPerpsV2MarketState ? legacyPerpsV2MarketState.address : constants.ZERO_ADDRESS,
			],
			skipPostDeploy: true,
		});

		const mockPerpsV2StateConsumer = await setupContract({
			accounts,
			contract: 'MockPerpsV2StateConsumer',
			args: [perpsV2MarketState.address],
			skipPostDeploy: true,
		});

		// Authorize new market state to operate over legacy market state
		if (legacyPerpsV2MarketState) {
			await legacyPerpsV2MarketState.addAssociatedContracts([perpsV2MarketState.address], {
				from: owner,
			});
		}

		// Remove owner authorization to operate over new market state
		await perpsV2MarketState.removeAssociatedContracts([owner], {
			from: owner,
		});

		// Authorize mock consumer to operate over new market state
		await perpsV2MarketState.addAssociatedContracts([mockPerpsV2StateConsumer.address], {
			from: owner,
		});

		await perpsV2MarketState.linkOrInitializeState({
			from: owner,
		});

		return { perpsV2MarketState, mockPerpsV2StateConsumer };
	};

	describe('test behaviour', () => {
		beforeEach('setup contracts', async () => {
			legacyPerpsV2MarketState = await setupContract({
				accounts,
				contract: 'PerpsV2MarketStateLegacyR1',
				args: [owner, [owner], baseAsset, marketKey],
				skipPostDeploy: true,
			});

			// Authorize user to operate over legacy market state
			await legacyPerpsV2MarketState.addAssociatedContracts([user], {
				from: owner,
			});
		});

		beforeEach('generate fake activity', async () => {
			generatedActivity = generateFakeActivity({
				fundingSequenceItemsCount,
				positionsCount,
				delayedOrdersCount,
			});
		});

		describe('when no activity was added ', () => {});
		describe('when only current has activity', () => {
			it('can read new data', async () => {
				const { perpsV2MarketState, mockPerpsV2StateConsumer } = await getAndLinkContracts();

				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});
			});
		});
		describe('when only legacy has activity', () => {
			it('can read old data', async () => {
				await addActivity({
					user,
					marketStateOrConsumer: legacyPerpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});

				const { perpsV2MarketState } = await getAndLinkContracts(legacyPerpsV2MarketState);

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});
			});
		});
		describe('when both, legacy and new state, have activity', () => {
			it('can read old and new data', async () => {
				const fundingSequenceItemsMiddleIdx = Math.floor(
					generatedActivity.fundingSequenceItems.length / 2
				);
				const positionsMiddleIdx = Math.floor(generatedActivity.positions.length / 2);
				const delayedOrdersMiddleIdx = Math.floor(generatedActivity.delayedOrders.length / 2);

				await addActivity({
					user,
					marketStateOrConsumer: legacyPerpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems.slice(
						0,
						fundingSequenceItemsMiddleIdx
					),
					positions: generatedActivity.positions.slice(0, positionsMiddleIdx),
					delayedOrders: generatedActivity.delayedOrders.slice(0, delayedOrdersMiddleIdx),
				});

				const { perpsV2MarketState, mockPerpsV2StateConsumer } = await getAndLinkContracts(
					legacyPerpsV2MarketState
				);

				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: generatedActivity.fundingSequenceItems.slice(
						fundingSequenceItemsMiddleIdx,
						generatedActivity.fundingSequenceItems.lenght
					),
					positions: generatedActivity.positions.slice(
						positionsMiddleIdx,
						generatedActivity.positions.lenght
					),
					delayedOrders: generatedActivity.delayedOrders.slice(
						delayedOrdersMiddleIdx,
						generatedActivity.delayedOrders.lenght
					),
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});

				// Replace all activity in new state
				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: [],
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
				});
			});
		});
	});
};

contract('PerpsV2MarketState - Linked', accounts => {
	const owner = accounts[1];
	const user = accounts[2];

	describe('Linked State', () => {
		describe('Basic operations', () => {
			describe('Before linking a legacy state', () => {});
			describe('When a legacy state is linked', () => {});
		});

		describe('When a legacy state does not exist', () => {});

		describe('When a legacy state exist without history', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 0,
				positionsCount: 0,
				delayedOrdersCount: 0,
			});
		});

		describe('When a legacy state exist with a small history', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 10,
				positionsCount: 5,
				delayedOrdersCount: 5,
			});
		});

		describe('When a legacy state exist with a large history', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 1000,
				positionsCount: 500,
				delayedOrdersCount: 50,
			});
		});
	});
});
