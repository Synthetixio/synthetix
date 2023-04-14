const { contract, web3 } = require('hardhat');
const { toUnit } = require('../utils')();
const { toBytes32, constants } = require('../..');
const { setupContract } = require('./setup');
const { assert } = require('./common');
const { getDecodedLogs, decodedEventEqual } = require('./helpers');

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
				desiredFillPrice: getRandomUnitBN(1000, 2000),
				targetRoundId: getRandomInt(100),
				commitDeposit: getRandomUnitBN(0, 10),
				keeperDeposit: getRandomUnitBN(0, 10),
				executableAtTime: 1677550000 + getRandomInt(100),
				intentionTime: 1677550000 + getRandomInt(100),
				trackingCode: `code${getRandomInt(100)}`,
			},
		});
	}

	const atomicValues = {
		marketKey: marketKey,
		baseAsset: baseAsset,
		marketSize: getRandomUnitBN(10000, 20000),
		marketSkew: getRandomUnitBN(-10000, 20000),
		fundingLastRecomputed: 1677550000 + getRandomInt(100),
		fundingRateLastRecomputed: getRandomUnitBN(-10000, 20000),
	};

	return { fundingSequenceItems, positions, delayedOrders, atomicValues };
};

const addActivity = async ({
	user,
	marketStateOrConsumer,
	fundingSequenceItems,
	positions,
	delayedOrders,
	atomicValues,
}) => {
	//
	await marketStateOrConsumer.setMarketSize(atomicValues.marketSize, {
		from: user,
	});
	await marketStateOrConsumer.setMarketSkew(atomicValues.marketSkew, {
		from: user,
	});
	await marketStateOrConsumer.setFundingLastRecomputed(atomicValues.fundingLastRecomputed, {
		from: user,
	});
	await marketStateOrConsumer.setFundingRateLastRecomputed(atomicValues.fundingRateLastRecomputed, {
		from: user,
	});

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
			delayedOrder.data.desiredFillPrice,
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
	atomicValues,
}) => {
	// Atomic values
	assert.equal(await marketStateOrConsumer.marketKey(), atomicValues.marketKey);
	assert.equal(await marketStateOrConsumer.baseAsset(), atomicValues.baseAsset);
	assert.bnEqual(await marketStateOrConsumer.marketSize(), atomicValues.marketSize);
	assert.bnEqual(await marketStateOrConsumer.marketSkew(), atomicValues.marketSkew);
	assert.bnEqual(
		await marketStateOrConsumer.fundingLastRecomputed(),
		atomicValues.fundingLastRecomputed
	);
	assert.bnEqual(
		await marketStateOrConsumer.fundingRateLastRecomputed(),
		atomicValues.fundingRateLastRecomputed
	);

	// Funding Sequence
	for (let i = 0; i < fundingSequenceItems.length; i++) {
		// funding sequence 0 is unused, we start at 1... duh
		assert.bnEqual(await marketStateOrConsumer.fundingSequence(i + 1), fundingSequenceItems[i]);
	}

	// Positions
	for (let i = 0; i < positions.length; i++) {
		const position = await marketStateOrConsumer.positions(positions[i].address);
		assert.bnEqual(position.id, positions[i].data.id);
		assert.bnEqual(position.lastFundingIndex, positions[i].data.lastFundingIndex);
		assert.bnEqual(position.margin, positions[i].data.margin);
		assert.bnEqual(position.lastPrice, positions[i].data.lastPrice);
		assert.bnEqual(position.size, positions[i].data.size);
	}

	// Delayed orders
	for (let i = 0; i < delayedOrders.length; i++) {
		const delayedOrder = await marketStateOrConsumer.delayedOrders(delayedOrders[i].address);
		assert.equal(delayedOrder.isOffchain, delayedOrders[i].data.isOffchain);
		assert.bnEqual(delayedOrder.sizeDelta, delayedOrders[i].data.sizeDelta);
		assert.bnEqual(delayedOrder.desiredFillPrice, delayedOrders[i].data.desiredFillPrice);
		assert.bnEqual(delayedOrder.targetRoundId, delayedOrders[i].data.targetRoundId);
		assert.bnEqual(delayedOrder.commitDeposit, delayedOrders[i].data.commitDeposit);
		assert.bnEqual(delayedOrder.keeperDeposit, delayedOrders[i].data.keeperDeposit);
		assert.bnEqual(delayedOrder.executableAtTime, delayedOrders[i].data.executableAtTime);
		assert.bnEqual(delayedOrder.intentionTime, delayedOrders[i].data.intentionTime);
		assert.equal(delayedOrder.trackingCode, toBytes32(delayedOrders[i].data.trackingCode));
	}
};

const getAndLinkContracts = async ({ legacyPerpsV2MarketState, accounts, owner }) => {
	const legacyState = legacyPerpsV2MarketState
		? legacyPerpsV2MarketState.address
		: constants.ZERO_ADDRESS;

	const perpsV2MarketState = await setupContract({
		accounts,
		contract: 'PerpsV2MarketState',
		args: [owner, [owner], baseAsset, marketKey, legacyState],
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

	describe('when used as state storage (read and write)', () => {
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

		describe('when there is no legacy market', () => {
			it('can write and read data', async () => {
				const { perpsV2MarketState, mockPerpsV2StateConsumer } = await getAndLinkContracts({
					accounts,
					owner,
				});

				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});
			});
		});

		describe('when only current has activity', () => {
			it('can write and read new data', async () => {
				const { perpsV2MarketState, mockPerpsV2StateConsumer } = await getAndLinkContracts({
					accounts,
					owner,
					legacyPerpsV2MarketState,
				});

				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});
			});
		});

		describe('when only legacy has activity', () => {
			it('can write and read old data', async () => {
				await addActivity({
					user,
					marketStateOrConsumer: legacyPerpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				const { perpsV2MarketState } = await getAndLinkContracts({
					accounts,
					owner,
					legacyPerpsV2MarketState,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});
			});
		});

		describe('when both, legacy and new state, have activity', () => {
			it('can write and read old and new data', async () => {
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
					atomicValues: generatedActivity.atomicValues,
				});

				const { perpsV2MarketState, mockPerpsV2StateConsumer } = await getAndLinkContracts({
					accounts,
					owner,
					legacyPerpsV2MarketState,
				});

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
					atomicValues: generatedActivity.atomicValues,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				// Replace all activity in new state
				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: [],
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: generatedActivity.fundingSequenceItems,
					positions: generatedActivity.positions,
					delayedOrders: generatedActivity.delayedOrders,
					atomicValues: generatedActivity.atomicValues,
				});

				// Update atomic data
				const newGeneratedActivity = generateFakeActivity({
					fundingSequenceItemsCount: 0,
					positionsCount: 0,
					delayedOrdersCount: 0,
				});

				await addActivity({
					user,
					marketStateOrConsumer: mockPerpsV2StateConsumer,
					fundingSequenceItems: [],
					positions: [],
					delayedOrders: [],
					atomicValues: newGeneratedActivity.atomicValues,
				});

				await retrieveAndVerifyData({
					marketStateOrConsumer: perpsV2MarketState,
					fundingSequenceItems: [],
					positions: [],
					delayedOrders: [],
					atomicValues: newGeneratedActivity.atomicValues,
				});
			});
		});
	});
};

contract('PerpsV2MarketState - Linked', accounts => {
	const owner = accounts[1];
	const user = accounts[2];

	describe('test basic data', async () => {
		let generatedLegacyActivity, legacyPerpsV2MarketState, perpsV2MarketState;
		beforeEach('generate fake activity', async () => {
			generatedLegacyActivity = generateFakeActivity({
				fundingSequenceItemsCount: 5,
				positionsCount: 5,
				delayedOrdersCount: 5,
			});
		});

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

			perpsV2MarketState = await setupContract({
				accounts,
				contract: 'PerpsV2MarketState',
				args: [owner, [owner], baseAsset, marketKey, legacyPerpsV2MarketState.address],
				skipPostDeploy: true,
			});

			await addActivity({
				user,
				marketStateOrConsumer: legacyPerpsV2MarketState,
				fundingSequenceItems: generatedLegacyActivity.fundingSequenceItems,
				positions: generatedLegacyActivity.positions,
				delayedOrders: generatedLegacyActivity.delayedOrders,
				atomicValues: generatedLegacyActivity.atomicValues,
			});
		});

		describe('when initializing', () => {
			it('gets initialized', async () => {
				assert.equal(await perpsV2MarketState.initialized(), false);

				const tx = await perpsV2MarketState.linkOrInitializeState({
					from: owner,
				});
				assert.equal(await perpsV2MarketState.initialized(), true);
				assert.equal(await perpsV2MarketState.legacyState(), legacyPerpsV2MarketState.address);
				assert.bnEqual(
					await perpsV2MarketState.legacyFundinSequenceOffset(),
					generatedLegacyActivity.fundingSequenceItems.length
				);

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2MarketState],
				});
				assert.equal(decodedLogs.length, 1);

				decodedEventEqual({
					event: 'MarketStateInitialized',
					emittedFrom: perpsV2MarketState.address,
					args: [
						marketKey,
						true,
						legacyPerpsV2MarketState.address,
						generatedLegacyActivity.fundingSequenceItems.length,
					],
					log: decodedLogs[0],
				});
			});
		});
	});

	describe('Linked State - Legacy', () => {
		describe('with no history data', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 0,
				positionsCount: 0,
				delayedOrdersCount: 0,
			});
		});

		describe('with a small quantity of history data', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 10,
				positionsCount: 5,
				delayedOrdersCount: 5,
			});
		});

		describe('with a large quantity of history data', () => {
			testBehaviour({
				accounts,
				owner,
				user,
				fundingSequenceItemsCount: 1000,
				positionsCount: 500,
				delayedOrdersCount: 200,
			});
		});
	});
});
