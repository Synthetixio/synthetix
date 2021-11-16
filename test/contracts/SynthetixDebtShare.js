'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupContract } = require('./setup');

const { toUnit } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('SynthetixDebtShare', async accounts => {
	const [owner, issuer, account1, account2] = accounts;

	let addressResolver, synthetixDebtShare;

	before(async () => {
		addressResolver = await setupContract({
			accounts,
			args: [owner],
			contract: 'AddressResolver',
		});

		synthetixDebtShare = await setupContract({
			accounts,
			args: [owner, addressResolver.address],
			contract: 'SynthetixDebtShare',
		});

		await addressResolver.importAddresses([toBytes32('Issuer')], [issuer], { from: owner });
		await synthetixDebtShare.rebuildCache();
		await synthetixDebtShare.addAuthorizedBroker(owner);
	});

	/* let lastSnapshotId;
	before(async () => {
		lastSnapshotId = await takeSnapshot();
	});

	beforeEach(async () => {
		await restoreSnapshot(lastSnapshotId);
	}); */
	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: synthetixDebtShare.abi,
			ignoreParents: ['Owned'],
			expected: [
				'mintShare',
				'burnShare',
				'transfer',
				'transferFrom',
				'approve',
				'importAddresses',
				'setCurrentPeriodId',
				'addAuthorizedBroker',
				'removeAuthorizedBroker',
				'finishSetup',
				'rebuildCache',
			],
		});
	});
	it('should set constructor params on deployment', async () => {
		const instance = await setupContract({
			accounts,
			contract: 'SynthetixDebtShare',
			args: [owner, addressResolver.address],
		});

		assert.equal(await instance.owner(), owner);
	});

	describe('mintShare()', () => {
		it('should disallow another from minting', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetixDebtShare.mintShare,
				args: [account2, toUnit('0.1')],
				accounts,
				address: issuer,
				skipPassCheck: true,
				reason: 'SynthetixDebtShare: only issuer can mint/burn',
			});
		});

		it('mints', async () => {
			await synthetixDebtShare.mintShare(account1, toUnit('10'), { from: issuer });

			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('10'));
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('10'));
		});

		it('mints twice on the same period', async () => {
			await synthetixDebtShare.mintShare(account1, toUnit('10'), { from: issuer });

			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('10'));
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('10'));

			await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });

			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('30'));
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('30'));
		});

		it('more than one person can mint', async () => {
			await synthetixDebtShare.mintShare(account1, toUnit('10'), { from: issuer });

			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('10'));
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('10'));

			await synthetixDebtShare.mintShare(account2, toUnit('20'), { from: issuer });

			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('10'));
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('30'));
		});

		describe('on new period', async () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('10'), { from: issuer });
				await synthetixDebtShare.setCurrentPeriodId(toUnit('10'), { from: issuer });
			});

			it('mints', async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });

				assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('30'));
				assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('30'));
			});

			describe('on another new period', () => {
				beforeEach(async () => {
					await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
					await synthetixDebtShare.setCurrentPeriodId(toUnit('50'), { from: issuer });
				});

				it('previous period is preserved', async () => {
					assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('30'));

					await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });

					assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('50'));

					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account1, toUnit('10')),
						toUnit('30')
					);
					assert.bnEqual(await synthetixDebtShare.totalSupplyOnPeriod(toUnit('10')), toUnit('30'));
				});
			});
		});
	});

	describe('burnShare()', () => {
		it('should disallow another from burning', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetixDebtShare.mintShare,
				args: [account2, toUnit('0.1')],
				address: issuer,
				accounts,
				reason: 'SynthetixDebtShare: only issuer can mint/burn',
			});
		});

		describe('when account already has shares minted', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('50'), { from: issuer });
				await synthetixDebtShare.setCurrentPeriodId(toUnit('10'), { from: issuer });
			});

			it('cannot burn more shares than the account has', async () => {
				await assert.revert(
					synthetixDebtShare.burnShare(account1, toUnit('60'), { from: issuer }),
					'SafeMath: subtraction overflow'
				);
			});

			it('burns', async () => {
				assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('50'));
				await synthetixDebtShare.burnShare(account1, toUnit('20'), { from: issuer });

				assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('30'));
				assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('30'));
			});

			describe('on another new period', () => {
				beforeEach(async () => {
					await synthetixDebtShare.burnShare(account1, toUnit('20'), { from: issuer });
					await synthetixDebtShare.setCurrentPeriodId(toUnit('50'), { from: issuer });
				});

				it('previous period is preserved', async () => {
					await synthetixDebtShare.burnShare(account1, toUnit('20'), { from: issuer });

					assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('10'));

					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account1, toUnit('10')),
						toUnit('30')
					);
					assert.bnEqual(await synthetixDebtShare.totalSupplyOnPeriod(toUnit('10')), toUnit('30'));
				});
			});
		});
	});

	describe('setCurrentPeriodId()', () => {
		it('fails when burning more than user has minted', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetixDebtShare.setCurrentPeriodId,
				args: [toUnit('10')],
				address: issuer,
				accounts,
				reason: 'SynthetixDebtShare: only issuer can mint/burn',
			});
		});

		describe('when successfully invoked', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('1'), { from: issuer });
				await synthetixDebtShare.setCurrentPeriodId(toUnit('10'), { from: issuer });
				await synthetixDebtShare.mintShare(account1, toUnit('1'), { from: issuer });
			});

			it('sets current period id', async () => {
				assert.bnEqual(await synthetixDebtShare.currentPeriodId(), toUnit('10'));
			});

			it('rolls totalSupply', async () => {
				assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('2'));
				assert.bnEqual(await synthetixDebtShare.totalSupplyOnPeriod(1), toUnit('1'));
			});
		});
	});

	describe('authorized broker functions', () => {
		it('only owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetixDebtShare.addAuthorizedBroker,
				args: [ZERO_ADDRESS],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
			await onlyGivenAddressCanInvoke({
				fnc: synthetixDebtShare.removeAuthorizedBroker,
				args: [ZERO_ADDRESS],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			beforeEach(async () => {
				await synthetixDebtShare.addAuthorizedBroker(account1, { from: owner });
			});

			it('sets broker', async () => {
				assert.bnEqual(await synthetixDebtShare.authorizedBrokers(account1), true);
			});

			describe('when broker is removed', () => {
				beforeEach(async () => {
					await synthetixDebtShare.removeAuthorizedBroker(account1, { from: owner });
				});

				it('sets broker', async () => {
					assert.bnEqual(await synthetixDebtShare.authorizedBrokers(account1), false);
				});
			});
		});
	});

	describe('transfer()', () => {
		it('should always fail', async () => {
			await assert.revert(
				synthetixDebtShare.transfer(account2, toUnit('0.1')),
				'debt shares are not transferrable'
			);
		});
	});

	describe('approve()', () => {
		it('should always fail', async () => {
			await assert.revert(
				synthetixDebtShare.approve(account2, toUnit('0.1')),
				'debt shares are not transferrable'
			);
		});
	});

	describe('transferFrom()', () => {
		describe('when account has some debt shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('100'), { from: issuer });
			});

			it('only allows authorized brokers to transferFrom', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: synthetixDebtShare.transferFrom,
					address: owner,
					args: [account1, account2, toUnit('0.1')],
					accounts,
					reason: 'SynthetixDebtShare: only brokers can transferFrom',
				});
			});

			it('fails transfer if exceeds balance', async () => {
				await assert.revert(synthetixDebtShare.transferFrom(account1, account2, toUnit('200')), '');
			});

			it('transfers', async () => {
				await synthetixDebtShare.transferFrom(account1, account2, toUnit('100'));

				assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('0'));
				assert.bnEqual(await synthetixDebtShare.balanceOf(account2), toUnit('100'));
			});
		});
	});

	describe('balanceOf()', () => {
		it('returns 0 balance initially', async () => {
			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('0'));
		});

		describe('when 2 accounts have minted shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
				await synthetixDebtShare.mintShare(account2, toUnit('80'), { from: issuer });
			});

			it('returns correct balances', async () => {
				assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('20'));
				assert.bnEqual(await synthetixDebtShare.balanceOf(account2), toUnit('80'));
			});
		});
	});

	describe('totalSupply()', () => {
		it('returns 0 balance initially', async () => {
			assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('0'));
		});

		describe('when 2 accounts have minted shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
				await synthetixDebtShare.mintShare(account2, toUnit('80'), { from: issuer });
			});

			it('returns correct totalSupply', async () => {
				assert.bnEqual(await synthetixDebtShare.totalSupply(), toUnit('100'));
			});
		});
	});

	describe('balanceOfOnPeriod()', () => {
		it('returns 0 balance initially', async () => {
			assert.bnEqual(await synthetixDebtShare.balanceOf(account1), toUnit('0'));
		});

		describe('when 2 accounts have minted shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
				await synthetixDebtShare.mintShare(account2, toUnit('80'), { from: issuer });
			});

			it('returns correct percentages for current period', async () => {
				assert.bnEqual(
					await synthetixDebtShare.balanceOfOnPeriod(account1, 1),
					toUnit('20')
				);
				assert.bnEqual(
					await synthetixDebtShare.balanceOfOnPeriod(account2, 1),
					toUnit('80')
				);
			});

			describe('when period changes', () => {
				beforeEach(async () => {
					await synthetixDebtShare.setCurrentPeriodId(toUnit('100'), { from: issuer });
				});

				it('returns correct percentages for last period', async () => {
					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account1, 1),
						toUnit('20')
					);
					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account2, 1),
						toUnit('80')
					);
				});

				it('returns correct percentages for current period', async () => {
					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account1, toUnit('100')),
						toUnit('20')
					);
					assert.bnEqual(
						await synthetixDebtShare.balanceOfOnPeriod(account2, toUnit('100')),
						toUnit('80')
					);
				});

				describe('when balance changes on new period', () => {
					beforeEach(async () => {
						await synthetixDebtShare.mintShare(account1, toUnit('40'), { from: issuer });
					});

					it('returns correct percentages for last period', async () => {
						assert.bnEqual(
							await synthetixDebtShare.balanceOfOnPeriod(account1, 1),
							toUnit('20')
						);
						assert.bnEqual(
							await synthetixDebtShare.balanceOfOnPeriod(account2, 1),
							toUnit('80')
						);
					});

					it('returns correct percentages for current period', async () => {
						assert.bnEqual(
							await synthetixDebtShare.balanceOfOnPeriod(account1, toUnit('100')),
							toUnit('60')
						);
						assert.bnEqual(
							await synthetixDebtShare.balanceOfOnPeriod(account2, toUnit('100')),
							toUnit('80')
						);
					});
				});
			});
		});
	});

	describe('sharePercent()', () => {
		describe('when 2 accounts have minted shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
				await synthetixDebtShare.mintShare(account2, toUnit('80'), { from: issuer });
			});

			it('returns correct percentages', async () => {
				assert.bnEqual(await synthetixDebtShare.sharePercent(account1), toUnit('0.2'));
				assert.bnEqual(await synthetixDebtShare.sharePercent(account2), toUnit('0.8'));
			});
		});
	});

	describe('sharePercentOnPeriod()', () => {
		describe('when 2 accounts have minted shares', () => {
			beforeEach(async () => {
				await synthetixDebtShare.mintShare(account1, toUnit('20'), { from: issuer });
				await synthetixDebtShare.mintShare(account2, toUnit('80'), { from: issuer });
			});

			it('returns correct percentages for current period', async () => {
				assert.bnEqual(
					await synthetixDebtShare.sharePercentOnPeriod(account1, 1),
					toUnit('0.2')
				);
				assert.bnEqual(
					await synthetixDebtShare.sharePercentOnPeriod(account2, 1),
					toUnit('0.8')
				);
			});

			describe('when period changes', () => {
				beforeEach(async () => {
					await synthetixDebtShare.setCurrentPeriodId(toUnit('100'), { from: issuer });
				});

				it('returns correct percentages for last period', async () => {
					assert.bnEqual(
						await synthetixDebtShare.sharePercentOnPeriod(account1, 1),
						toUnit('0.2')
					);
					assert.bnEqual(
						await synthetixDebtShare.sharePercentOnPeriod(account2, 1),
						toUnit('0.8')
					);
				});

				it('returns correct percentages for current period', async () => {
					assert.bnEqual(
						await synthetixDebtShare.sharePercentOnPeriod(account1, 1),
						toUnit('0.2')
					);
					assert.bnEqual(
						await synthetixDebtShare.sharePercentOnPeriod(account2, 1),
						toUnit('0.8')
					);
				});

				describe('when balance changes on new period', () => {
					beforeEach(async () => {
						await synthetixDebtShare.mintShare(account1, toUnit('100'), { from: issuer });
					});

					it('returns correct percentages for last period', async () => {
						assert.bnEqual(
							await synthetixDebtShare.sharePercentOnPeriod(account1, 1),
							toUnit('0.2')
						);
						assert.bnEqual(
							await synthetixDebtShare.sharePercentOnPeriod(account2, 1),
							toUnit('0.8')
						);
					});

					it('returns correct percentages for current period', async () => {
						assert.bnEqual(
							await synthetixDebtShare.sharePercentOnPeriod(account1, toUnit('100')),
							toUnit('0.6')
						);
						assert.bnEqual(
							await synthetixDebtShare.sharePercentOnPeriod(account2, toUnit('100')),
							toUnit('0.4')
						);
					});
				});
			});
		});
	});
});
