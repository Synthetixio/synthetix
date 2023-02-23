const { contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { toBytes32, constants } = require('../..');
const { setupContract } = require('./setup');
// const { assert } = require('./common');

// const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const marketKey = toBytes32('sETH-perps');
const baseAsset = toBytes32('sETH');

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
		const generateFakeActivity = ({
			fundingSequenceItemsCount,
			positionsCount,
			delayedOrdersCount,
		}) => {
			console.log({
				fundingSequenceItemsCount,
				positionsCount,
				delayedOrdersCount,
			});
			const fundingSequence = false;
			const position = false;
			const delayedOrder = false;
			return { fundingSequence, position, delayedOrder };
		};
		const addActivity = async ({ fundingSequence, position, delayedOrder }) => {
			console.log({ fundingSequence, position, delayedOrder });
			console.log({ owner, user, user2 });
			console.log(toBN(1).toString());
		};
		const retrieveAndVerifyData = async ({ fundingSequence, position, delayedOrder }) => {
			console.log({ fundingSequence, position, delayedOrder });
		};
		const testBehaviour = ({ fundingSequenceItemsCount, positionsCount, delayedOrdersCount }) => {
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
						fundingSequence: generatedActivity.fundingSequence,
						position: generatedActivity.position,
						delayedOrder: generatedActivity.delayedOrder,
					});
					await retrieveAndVerifyData({
						fundingSequence: generatedActivity.fundingSequence,
						position: generatedActivity.position,
						delayedOrder: generatedActivity.delayedOrder,
					});
				});
			});
		};

		describe('Basic operations', () => {
			describe('Before linking a legacy state', () => {});
			describe('When a legacy state is linked', () => {});
		});

		describe('When a legacy state does not exist', () => {});

		describe('When a legacy state exist without history', () => {
			testBehaviour({
				fundingSequenceItemsCount: 0,
				positionsCount: 0,
				delayedOrdersCount: 0,
			});
		});

		describe('When a legacy state exist with a small history', () => {
			testBehaviour({
				fundingSequenceItemsCount: 10,
				positionsCount: 5,
				delayedOrdersCount: 5,
			});
		});

		describe('When a legacy state exist with a large history', () => {
			testBehaviour({
				fundingSequenceItemsCount: 20000,
				positionsCount: 500,
				delayedOrdersCount: 50,
			});
		});
	});
});
