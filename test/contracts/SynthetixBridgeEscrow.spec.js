const { contract, web3 } = require('hardhat');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixBridgeEscrow (spec tests) @ovm-skip', accounts => {
	const [, owner, snxBridgeToOptimism, user] = accounts;

	let synthetix, synthetixBridgeEscrow;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SynthetixBridgeEscrow: synthetixBridgeEscrow,
			} = await setupAllContracts({
				accounts,
				contracts: ['Synthetix', 'SynthetixBridgeEscrow'],
			}));
		});

		describe('approveBridge', () => {
			describe('when invoked by the owner', () => {
				const amount = toBN('1000');

				beforeEach(async () => {
					await synthetix.transfer(synthetixBridgeEscrow.address, amount, {
						from: owner,
					});
				});

				describe('when there is no approval', () => {
					it(' should fail', async () => {
						await assert.revert(
							synthetix.transferFrom(synthetixBridgeEscrow.address, user, amount, {
								from: snxBridgeToOptimism,
							}),
							'SafeMath: subtraction overflow'
						);
					});
				});

				describe('when there is approval', () => {
					beforeEach(async () => {
						await synthetixBridgeEscrow.approveBridge(snxBridgeToOptimism, amount, {
							from: owner,
						});
					});

					describe('when the bridge invokes transferFrom()', () => {
						beforeEach(async () => {
							await synthetix.transferFrom(synthetixBridgeEscrow.address, user, amount, {
								from: snxBridgeToOptimism,
							});
						});

						it("increases the users's balance", async () => {
							assert.bnEqual(await synthetix.balanceOf(user), amount);
						});
					});
				});
			});
		});
	});
});
