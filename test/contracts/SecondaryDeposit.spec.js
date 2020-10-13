const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SecondaryDeposit', accounts => {
	const [, owner] = accounts;

	let synthetix, secondaryDeposit, systemSettings;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SecondaryDeposit: secondaryDeposit,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				contracts: ['Synthetix', 'Issuer', 'RewardEscrow', 'SecondaryDeposit', 'SystemSettings'],
			}));
		});

		describe('when setting a maximumDeposit', () => {
			before('set maximumDeposit', async () => {
				await systemSettings.setMaximumDeposit(100, {
					from: owner,
				});
			});

			describe('when a user has provided allowance to the deposit contract', () => {
				const amountToDeposit = 1;

				before('approve SecondaryDeposit', async () => {
					await synthetix.approve(secondaryDeposit.address, 1, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;

					before('record balance before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
					});

					before('perform a deposit', async () => {
						await secondaryDeposit.deposit(amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceAfter, userBalanceBefore.sub(toBN(amountToDeposit)));
					});
				});
			});
		});
	});
});
