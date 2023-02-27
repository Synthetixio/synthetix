const { contract, web3 } = require('hardhat');
const { toUnit } = require('../utils')();
const { toBytes32, constants } = require('../..');
const { setupContract } = require('./setup');
// const { assert } = require('./common');

// const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const marketKey = toBytes32('sETH-perps');
const baseAsset = toBytes32('sETH');

const generateFakeActivity = ({
	fundingSequenceItemsCount,
	positionsCount,
	delayedOrdersCount,
	positionsIdOffset = 0,
	positionsFundingIdxOffset = 0,
}) => {
	const getRandomInt = max => {
		return Math.floor(Math.random() * max);
	};

	const getRandomUnitBN = (min, max) => {
		return toUnit(Math.random() * (max - min) + min);
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
			position: {
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
			delayedOrder: {
				isOffchain: getRandomInt(2) === 1,
				sizeDelta: getRandomUnitBN(-10, 10),
				priceImpactDelta: toUnit('.05'),
				targetRoundId: getRandomInt(100),
				commitDeposit: getRandomUnitBN(0, 10),
				keeperDeposit: getRandomUnitBN(0, 10),
				executableAtTime: 1677550000 + getRandomInt(100),
				intentionTime: 1677550000 + getRandomInt(100),
				trackingCode: toBytes32(`code${getRandomInt(100)}`),
			},
		});
	}
	return { fundingSequenceItems, positions, delayedOrders };
};

const addActivity = async ({
	owner,
	user,
	user2,
	fundingSequenceItems,
	positions,
	delayedOrders,
}) => {
	console.log({ fsi: fundingSequenceItems.length, p: positions.length, do: delayedOrders.length });
	console.log({ owner, user, user2 });
};

const retrieveAndVerifyData = async ({ fundingSequenceItems, positions, delayedOrders }) => {
	console.log({ fsi: fundingSequenceItems.length, p: positions.length, do: delayedOrders.length });
};

const testBehaviour = ({
	owner,
	user,
	user2,
	fundingSequenceItemsCount,
	positionsCount,
	delayedOrdersCount,
}) => {
	let generatedActivity;

	describe('test behaviour', () => {
		beforeEach('do not generate history', async () => {
			generatedActivity = generateFakeActivity({
				fundingSequenceItemsCount,
				positionsCount,
				delayedOrdersCount,
			});
		});

		it('test ', async () => {
			await addActivity({
				owner,
				user,
				user2,
				fundingSequenceItems: generatedActivity.fundingSequenceItems,
				positions: generatedActivity.positions,
				delayedOrders: generatedActivity.delayedOrders,
			});

			await retrieveAndVerifyData({
				fundingSequenceItems: generatedActivity.fundingSequenceItems,
				positions: generatedActivity.positions,
				delayedOrders: generatedActivity.delayedOrders,
			});
		});
	});
};

contract('PerpsV2MarketState - Linked', accounts => {
	let perpsV2MarketState, mockPerpsV2StateConsumer;

	const owner = accounts[1];
	const user = accounts[2];
	const user2 = accounts[3];

	beforeEach(async () => {
		perpsV2MarketState = await setupContract({
			accounts,
			contract: 'PerpsV2MarketState',
			args: [owner, [owner], baseAsset, marketKey, constants.ZERO_ADDRESS],
			skipPostDeploy: true,
		});

		mockPerpsV2StateConsumer = await setupContract({
			accounts,
			contract: 'MockPerpsV2StateConsumer',
			args: [perpsV2MarketState.address],
			skipPostDeploy: true,
		});

		await perpsV2MarketState.removeAssociatedContracts([owner], {
			from: owner,
		});

		await perpsV2MarketState.addAssociatedContracts([mockPerpsV2StateConsumer.address], {
			from: owner,
		});
	});

	describe('Linked State', () => {
		describe('Basic operations', () => {
			describe('Before linking a legacy state', () => {});
			describe('When a legacy state is linked', () => {});
		});

		describe('When a legacy state does not exist', () => {});

		describe('When a legacy state exist without history', () => {
			testBehaviour({
				owner,
				user,
				user2,
				fundingSequenceItemsCount: 0,
				positionsCount: 0,
				delayedOrdersCount: 0,
			});
		});

		describe('When a legacy state exist with a small history', () => {
			testBehaviour({
				owner,
				user,
				user2,
				fundingSequenceItemsCount: 10,
				positionsCount: 5,
				delayedOrdersCount: 5,
			});
		});

		describe('When a legacy state exist with a large history', () => {
			testBehaviour({
				owner,
				user,
				user2,
				fundingSequenceItemsCount: 20000,
				positionsCount: 500,
				delayedOrdersCount: 50,
			});
		});
	});
});
