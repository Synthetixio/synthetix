const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixL1ToL2Bridge (spec tests)', accounts => {
	const [, owner] = accounts;

	let synthetix, synthetixL1ToL2Bridge, systemSettings;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SynthetixL1ToL2Bridge: synthetixL1ToL2Bridge,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				contracts: [
					'Synthetix',
					'Issuer',
					'RewardEscrow',
					'SynthetixL1ToL2Bridge',
					'SystemSettings',
				],
			}));
		});

		describe('when setting a maximumDeposit', () => {
			before('set maximumDeposit', async () => {
				await systemSettings.setMaximumDeposit(100, {
					from: owner,
				});
			});

			describe('when a user has provided allowance to the bridge contract', () => {
				const amountToDeposit = 1;

				before('approve SynthetixL1ToL2Bridge', async () => {
					await synthetix.approve(synthetixL1ToL2Bridge.address, 1, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;

					before('record balance before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
					});

					before('perform a deposit', async () => {
						await synthetixL1ToL2Bridge.deposit(amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceBefore.sub(toBN(amountToDeposit)), userBalanceAfter);
					});
				});
			});
		});
	});
});
