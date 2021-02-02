'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const SystemStatus = artifacts.require('SystemStatus');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');

contract('SystemStatus', async accounts => {
	const [SYSTEM, ISSUANCE, EXCHANGE, SYNTH_EXCHANGE, SYNTH] = [
		'System',
		'Issuance',
		'Exchange',
		'SynthExchange',
		'Synth',
	].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let SUSPENSION_REASON_UPGRADE;
	let systemStatus;

	beforeEach(async () => {
		systemStatus = await SystemStatus.new(owner);
		SUSPENSION_REASON_UPGRADE = (await systemStatus.SUSPENSION_REASON_UPGRADE()).toString();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: systemStatus.abi,
			ignoreParents: ['Owned'],
			expected: [
				'resumeExchange',
				'resumeIssuance',
				'resumeSynth',
				'resumeSynthExchange',
				'resumeSynthsExchange',
				'resumeSystem',
				'suspendExchange',
				'suspendIssuance',
				'suspendSynth',
				'suspendSynthExchange',
				'suspendSynthsExchange',
				'suspendSystem',
				'updateAccessControl',
			],
		});
	});

	describe('suspendSystem()', () => {
		let txn;

		it('is not suspended initially', async () => {
			const { suspended, reason } = await systemStatus.systemSuspension();
			assert.equal(suspended, false);
			assert.equal(reason, '0');
		});

		it('and all the require checks succeed', async () => {
			await systemStatus.requireSystemActive();
			await systemStatus.requireIssuanceActive();
			await systemStatus.requireSynthActive(toBytes32('sETH'));
			await systemStatus.requireSynthsActive(toBytes32('sBTC'), toBytes32('sETH'));
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendSystem,
				accounts,
				address: owner,
				args: ['0'],
				reason: 'Restricted to access control list',
			});
		});
		it('by default isSystemUpgrading() is false', async () => {
			const isSystemUpgrading = await systemStatus.isSystemUpgrading();
			assert.equal(isSystemUpgrading, false);
		});

		describe('when the owner suspends', () => {
			let givenReason;
			beforeEach(async () => {
				givenReason = '3';
				txn = await systemStatus.suspendSystem(givenReason, { from: owner });
			});
			it('it succeeds', async () => {
				const { suspended, reason } = await systemStatus.systemSuspension();
				assert.equal(suspended, true);
				assert.equal(reason, givenReason);
			});
			it('and isSystemUpgrading() is false', async () => {
				const isSystemUpgrading = await systemStatus.isSystemUpgrading();
				assert.equal(isSystemUpgrading, false);
			});
			it('and emits the expected event', async () => {
				assert.eventEqual(txn, 'SystemSuspended', [givenReason]);
			});
			it('and the require checks all revert as expected', async () => {
				const reason = 'Synthetix is suspended. Operation prohibited';
				await assert.revert(systemStatus.requireSystemActive(), reason);
				await assert.revert(systemStatus.requireIssuanceActive(), reason);
				await assert.revert(systemStatus.requireSynthActive(toBytes32('sETH')), reason);
				await assert.revert(
					systemStatus.requireSynthsActive(toBytes32('sBTC'), toBytes32('sETH')),
					reason
				);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(SYSTEM, account1, true, false, { from: owner });
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(systemStatus.suspendSystem('0', { from: account2 }));
				await assert.revert(
					systemStatus.suspendSystem(SUSPENSION_REASON_UPGRADE, { from: account3 })
				);
			});

			describe('and that address invokes suspend with upgrading', () => {
				beforeEach(async () => {
					txn = await systemStatus.suspendSystem(SUSPENSION_REASON_UPGRADE, { from: account1 });
				});
				it('it succeeds', async () => {
					const { suspended, reason } = await systemStatus.systemSuspension();
					assert.equal(suspended, true);
					assert.equal(reason, SUSPENSION_REASON_UPGRADE);
				});
				it('and emits the expected event', async () => {
					assert.eventEqual(txn, 'SystemSuspended', [SUSPENSION_REASON_UPGRADE]);
				});
				it('and isSystemUpgrading() is true', async () => {
					const isSystemUpgrading = await systemStatus.isSystemUpgrading();
					assert.equal(isSystemUpgrading, true);
				});
				it('and the require checks all revert with system upgrading, as expected', async () => {
					const reason = 'Synthetix is suspended, upgrade in progress... please stand by';
					await assert.revert(systemStatus.requireSystemActive(), reason);
					await assert.revert(systemStatus.requireIssuanceActive(), reason);
					await assert.revert(systemStatus.requireSynthActive(toBytes32('sETH')), reason);
					await assert.revert(
						systemStatus.requireSynthsActive(toBytes32('sBTC'), toBytes32('sETH')),
						reason
					);
				});
				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeSystem({ from: account1 }),
						'Restricted to access control list'
					);
				});
				it('nor can it do any other restricted action', async () => {
					await assert.revert(
						systemStatus.updateAccessControl(SYSTEM, account2, true, true, { from: account1 })
					);
					await assert.revert(systemStatus.suspendIssuance('0', { from: account1 }));
					await assert.revert(systemStatus.resumeIssuance({ from: account1 }));
					await assert.revert(
						systemStatus.suspendSynth(toBytes32('sETH'), '0', { from: account1 })
					);
					await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account1 }));
				});
				it('yet the owner can still resume', async () => {
					await systemStatus.resumeSystem({ from: owner });
				});
			});
		});
	});

	describe('resumeSystem()', () => {
		let txn;
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeSystem,
				accounts,
				address: owner,
				args: [],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends within the upgrading flag', () => {
			beforeEach(async () => {
				await systemStatus.suspendSystem(SUSPENSION_REASON_UPGRADE, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(SYSTEM, account1, false, true, { from: owner });
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeSystem({ from: account2 }),
						'Restricted to access control list'
					);
					await assert.revert(
						systemStatus.resumeSystem({ from: account3 }),
						'Restricted to access control list'
					);
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeSystem({ from: account1 });
					});

					it('it succeeds', async () => {
						const { suspended, reason } = await systemStatus.systemSuspension();
						assert.equal(suspended, false);
						assert.equal(reason, '0');
					});

					it('and emits the expected event with the upgrading flag', async () => {
						assert.eventEqual(txn, 'SystemResumed', [SUSPENSION_REASON_UPGRADE]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireSynthActive(toBytes32('sETH'));
					});

					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendSystem('0', { from: account1 }),
							'Restricted to access control list'
						);
					});

					it('nor can it do any other restricted action', async () => {
						await assert.revert(
							systemStatus.updateAccessControl(SYSTEM, account2, false, true, { from: account1 })
						);
						await assert.revert(
							systemStatus.suspendIssuance(SUSPENSION_REASON_UPGRADE, { from: account1 })
						);
						await assert.revert(systemStatus.resumeIssuance({ from: account1 }));
						await assert.revert(
							systemStatus.suspendSynth(toBytes32('sETH'), '66', { from: account1 })
						);
						await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account1 }));
					});
				});
			});
		});
	});

	describe('suspendIssuance()', () => {
		let txn;

		it('is not suspended initially', async () => {
			const { suspended, reason } = await systemStatus.issuanceSuspension();
			assert.equal(suspended, false);
			assert.equal(reason, '0');
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendIssuance,
				accounts,
				address: owner,
				args: ['0'],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			beforeEach(async () => {
				txn = await systemStatus.suspendIssuance('5', { from: owner });
			});
			it('it succeeds', async () => {
				const { suspended, reason } = await systemStatus.issuanceSuspension();
				assert.equal(suspended, true);
				assert.equal(reason, '5');
				assert.eventEqual(txn, 'IssuanceSuspended', ['5']);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(ISSUANCE, account2, true, false, { from: owner });
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(
					systemStatus.suspendIssuance('1', { from: account1 }),
					'Restricted to access control list'
				);
				await assert.revert(
					systemStatus.suspendIssuance('10', { from: account3 }),
					'Restricted to access control list'
				);
			});

			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					txn = await systemStatus.suspendIssuance('33', { from: account2 });
				});
				it('it succeeds', async () => {
					const { suspended, reason } = await systemStatus.issuanceSuspension();
					assert.equal(suspended, true);
					assert.equal(reason, '33');
				});
				it('and emits the expected event', async () => {
					assert.eventEqual(txn, 'IssuanceSuspended', ['33']);
				});
				it('and the issuance require check reverts as expected', async () => {
					await assert.revert(
						systemStatus.requireIssuanceActive(),
						'Issuance is suspended. Operation prohibited'
					);
				});
				it('but not the others', async () => {
					await systemStatus.requireSystemActive();
					await systemStatus.requireSynthActive(toBytes32('sETH'));
				});
				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeIssuance({ from: account2 }),
						'Restricted to access control list'
					);
				});
				it('nor can it do any other restricted action', async () => {
					await assert.revert(
						systemStatus.updateAccessControl(SYSTEM, account3, true, true, { from: account3 })
					);
					await assert.revert(
						systemStatus.suspendSystem(SUSPENSION_REASON_UPGRADE, { from: account2 })
					);
					await assert.revert(systemStatus.resumeSystem({ from: account2 }));
					await assert.revert(
						systemStatus.suspendSynth(toBytes32('sETH'), '55', { from: account2 })
					);
					await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account2 }));
				});
				it('yet the owner can still resume', async () => {
					await systemStatus.resumeIssuance({ from: owner });
				});
			});
		});
	});

	describe('resumeIssuance()', () => {
		let txn;
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeIssuance,
				accounts,
				address: owner,
				args: [],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '5';
			beforeEach(async () => {
				await systemStatus.suspendIssuance(givenReason, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(ISSUANCE, account2, false, true, { from: owner });
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(systemStatus.resumeIssuance({ from: account1 }));
					await assert.revert(systemStatus.resumeIssuance({ from: account3 }));
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeIssuance({ from: account2 });
					});

					it('it succeeds', async () => {
						const { suspended, reason } = await systemStatus.issuanceSuspension();
						assert.equal(suspended, false);
						assert.equal(reason, '0');
					});

					it('and emits the expected event', async () => {
						assert.eventEqual(txn, 'IssuanceResumed', [givenReason]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireSynthActive(toBytes32('sETH'));
					});

					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendIssuance('1', { from: account2 }),
							'Restricted to access control list'
						);
					});

					it('nor can it do any other restricted action', async () => {
						await assert.revert(
							systemStatus.updateAccessControl(SYSTEM, account3, false, true, { from: account2 })
						);
						await assert.revert(systemStatus.suspendSystem('8', { from: account2 }));
						await assert.revert(systemStatus.resumeSystem({ from: account2 }));
						await assert.revert(
							systemStatus.suspendSynth(toBytes32('sETH'), '5', { from: account2 })
						);
						await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account2 }));
					});
				});
			});
		});
	});

	describe('suspendExchange()', () => {
		let txn;

		it('is not suspended initially', async () => {
			const { suspended, reason } = await systemStatus.exchangeSuspension();
			assert.equal(suspended, false);
			assert.equal(reason, '0');
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendExchange,
				accounts,
				address: owner,
				args: ['0'],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			beforeEach(async () => {
				txn = await systemStatus.suspendExchange('5', { from: owner });
			});
			it('it succeeds', async () => {
				const { suspended, reason } = await systemStatus.exchangeSuspension();
				assert.equal(suspended, true);
				assert.equal(reason, '5');
				assert.eventEqual(txn, 'ExchangeSuspended', ['5']);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(EXCHANGE, account2, true, false, { from: owner });
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(
					systemStatus.suspendExchange('1', { from: account1 }),
					'Restricted to access control list'
				);
				await assert.revert(
					systemStatus.suspendExchange('10', { from: account3 }),
					'Restricted to access control list'
				);
			});

			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					txn = await systemStatus.suspendExchange('33', { from: account2 });
				});
				it('it succeeds', async () => {
					const { suspended, reason } = await systemStatus.exchangeSuspension();
					assert.equal(suspended, true);
					assert.equal(reason, '33');
				});
				it('and emits the expected event', async () => {
					assert.eventEqual(txn, 'ExchangeSuspended', ['33']);
				});
				it('and the exchange require check reverts as expected', async () => {
					await assert.revert(
						systemStatus.requireExchangeActive(),
						'Exchange is suspended. Operation prohibited'
					);
				});
				it('and requireExchangeBetweenSynthsAllowed reverts as expected', async () => {
					await assert.revert(
						systemStatus.requireExchangeBetweenSynthsAllowed(toBytes32('sETH'), toBytes32('sBTC')),
						'Exchange is suspended. Operation prohibited'
					);
				});
				it('but not the others', async () => {
					await systemStatus.requireSystemActive();
					await systemStatus.requireSynthActive(toBytes32('sETH'));
				});

				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeExchange({ from: account2 }),
						'Restricted to access control list'
					);
				});
				it('nor can it do any other restricted action', async () => {
					await assert.revert(
						systemStatus.updateAccessControl(SYSTEM, account3, true, true, { from: account3 })
					);
					await assert.revert(
						systemStatus.suspendSystem(SUSPENSION_REASON_UPGRADE, { from: account2 })
					);
					await assert.revert(systemStatus.resumeSystem({ from: account2 }));
					await assert.revert(
						systemStatus.suspendSynth(toBytes32('sETH'), '55', { from: account2 })
					);
					await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account2 }));
				});
				it('yet the owner can still resume', async () => {
					await systemStatus.resumeExchange({ from: owner });
				});
			});
		});
	});

	describe('resumeExchange()', () => {
		let txn;
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeExchange,
				accounts,
				address: owner,
				args: [],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '5';
			beforeEach(async () => {
				await systemStatus.suspendExchange(givenReason, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(EXCHANGE, account2, false, true, { from: owner });
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(systemStatus.resumeExchange({ from: account1 }));
					await assert.revert(systemStatus.resumeExchange({ from: account3 }));
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeExchange({ from: account2 });
					});

					it('it succeeds', async () => {
						const { suspended, reason } = await systemStatus.exchangeSuspension();
						assert.equal(suspended, false);
						assert.equal(reason, '0');
					});

					it('and emits the expected event', async () => {
						assert.eventEqual(txn, 'ExchangeResumed', [givenReason]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireExchangeActive();
						await systemStatus.requireExchangeBetweenSynthsAllowed(
							toBytes32('sETH'),
							toBytes32('sBTC')
						);
						await systemStatus.requireSynthActive(toBytes32('sETH'));
					});

					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendExchange('1', { from: account2 }),
							'Restricted to access control list'
						);
					});

					it('nor can it do any other restricted action', async () => {
						await assert.revert(
							systemStatus.updateAccessControl(SYSTEM, account3, false, true, { from: account2 })
						);
						await assert.revert(systemStatus.suspendSystem('8', { from: account2 }));
						await assert.revert(systemStatus.resumeSystem({ from: account2 }));
						await assert.revert(
							systemStatus.suspendSynth(toBytes32('sETH'), '5', { from: account2 })
						);
						await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account2 }));
					});
				});
			});
		});
	});

	describe('suspendSynthExchange()', () => {
		let txn;
		const sBTC = toBytes32('sBTC');

		it('is not suspended initially', async () => {
			const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
			assert.equal(suspended, false);
			assert.equal(reason, '0');
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendSynthExchange,
				accounts,
				address: owner,
				args: [sBTC, '0'],
				reason: 'Restricted to access control list',
			});
		});

		it('getSynthExchangeSuspensions(sETH, sBTC, iBTC) is empty', async () => {
			const { exchangeSuspensions, reasons } = await systemStatus.getSynthExchangeSuspensions(
				['sETH', 'sBTC', 'iBTC'].map(toBytes32)
			);
			assert.deepEqual(exchangeSuspensions, [false, false, false]);
			assert.deepEqual(reasons, ['0', '0', '0']);
		});

		describe('when the owner suspends', () => {
			const givenReason = '150';
			beforeEach(async () => {
				txn = await systemStatus.suspendSynthExchange(sBTC, givenReason, { from: owner });
			});
			it('it succeeds', async () => {
				const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
				assert.equal(suspended, true);
				assert.equal(reason, givenReason);
				assert.eventEqual(txn, 'SynthExchangeSuspended', [sBTC, reason]);
			});
			it('getSynthExchangeSuspensions(sETH, sBTC, iBTC) returns values for sBTC', async () => {
				const { exchangeSuspensions, reasons } = await systemStatus.getSynthExchangeSuspensions(
					['sETH', 'sBTC', 'iBTC'].map(toBytes32)
				);
				assert.deepEqual(exchangeSuspensions, [false, true, false]);
				assert.deepEqual(reasons, ['0', givenReason, '0']);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(SYNTH_EXCHANGE, account3, true, false, {
					from: owner,
				});
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(
					systemStatus.suspendSynthExchange(sBTC, '4', { from: account1 }),
					'Restricted to access control list'
				);
				await assert.revert(
					systemStatus.suspendSynthExchange(sBTC, '0', { from: account2 }),
					'Restricted to access control list'
				);
			});

			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					txn = await systemStatus.suspendSynthExchange(sBTC, '3', { from: account3 });
				});
				it('it succeeds', async () => {
					const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
					assert.equal(suspended, true);
					assert.equal(reason, '3');
				});
				it('and emits the expected event', async () => {
					assert.eventEqual(txn, 'SynthExchangeSuspended', [sBTC, '3']);
				});
				it('and the synth require check reverts as expected', async () => {
					await assert.revert(
						systemStatus.requireSynthExchangeActive(sBTC),
						'Synth exchange suspended. Operation prohibited'
					);
				});
				it('but not the others', async () => {
					await systemStatus.requireSystemActive();
					await systemStatus.requireIssuanceActive();
					await systemStatus.requireSynthActive(sBTC);
					await systemStatus.requireSynthsActive(toBytes32('sETH'), sBTC);
				});
				it('and requireExchangeBetweenSynthsAllowed() reverts if one is the given synth', async () => {
					const reason = 'Synth exchange suspended. Operation prohibited';
					await assert.revert(
						systemStatus.requireExchangeBetweenSynthsAllowed(toBytes32('sETH'), sBTC),
						reason
					);
					await assert.revert(
						systemStatus.requireExchangeBetweenSynthsAllowed(sBTC, toBytes32('sTRX')),
						reason
					);
					await systemStatus.requireExchangeBetweenSynthsAllowed(
						toBytes32('sETH'),
						toBytes32('sUSD')
					); // no issues
					await systemStatus.requireExchangeBetweenSynthsAllowed(
						toBytes32('iTRX'),
						toBytes32('iBTC')
					); // no issues
				});
				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeSynthExchange(sBTC, { from: account2 }),
						'Restricted to access control list'
					);
				});

				it('yet the owner can still resume', async () => {
					await systemStatus.resumeSynthExchange(sBTC, { from: owner });
				});
			});
		});
	});

	describe('resumeSynthExchange()', () => {
		const sBTC = toBytes32('sBTC');

		let txn;
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeSynthExchange,
				accounts,
				address: owner,
				args: [sBTC],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '55';
			beforeEach(async () => {
				await systemStatus.suspendSynthExchange(sBTC, givenReason, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(SYNTH_EXCHANGE, account3, false, true, {
						from: owner,
					});
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(systemStatus.resumeSynthExchange(sBTC, { from: account1 }));
					await assert.revert(systemStatus.resumeSynthExchange(sBTC, { from: account2 }));
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeSynthExchange(sBTC, { from: account3 });
					});

					it('it succeeds', async () => {
						const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
						assert.equal(suspended, false);
						assert.equal(reason, '0');
					});

					it('and emits the expected event', async () => {
						assert.eventEqual(txn, 'SynthExchangeResumed', [sBTC, givenReason]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireExchangeBetweenSynthsAllowed(toBytes32('sETH'), sBTC);
						await systemStatus.requireSynthActive(sBTC);
						await systemStatus.requireSynthsActive(sBTC, toBytes32('sETH'));
						await systemStatus.requireSynthsActive(toBytes32('sETH'), sBTC);
					});

					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendSynthExchange(sBTC, givenReason, { from: account2 }),
							'Restricted to access control list'
						);
					});

					it('getSynthExchangeSuspensions(sETH, sBTC, iBTC) is empty', async () => {
						const { exchangeSuspensions, reasons } = await systemStatus.getSynthExchangeSuspensions(
							['sETH', 'sBTC', 'iBTC'].map(toBytes32)
						);
						assert.deepEqual(exchangeSuspensions, [false, false, false]);
						assert.deepEqual(reasons, ['0', '0', '0']);
					});
				});
			});
		});
	});

	describe('suspendSynthsExchange()', () => {
		let txn;
		const [sBTC, sETH] = ['sBTC', 'sETH'].map(toBytes32);

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendSynthsExchange,
				accounts,
				address: owner,
				args: [[sBTC, sETH], '0'],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '150';
			beforeEach(async () => {
				txn = await systemStatus.suspendSynthsExchange([sBTC, sETH], givenReason, { from: owner });
			});
			it('it succeeds for BTC', async () => {
				const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
				assert.equal(suspended, true);
				assert.equal(reason, givenReason);
				assert.eventEqual(txn.logs[0], 'SynthExchangeSuspended', [sBTC, reason]);
			});
			it('and for ETH', async () => {
				const { suspended, reason } = await systemStatus.synthExchangeSuspension(sETH);
				assert.equal(suspended, true);
				assert.equal(reason, givenReason);
				assert.eventEqual(txn.logs[1], 'SynthExchangeSuspended', [sETH, reason]);
			});
			it('getSynthExchangeSuspensions(sETH, sBTC, iBTC) returns values for sETH and sBTC', async () => {
				const { exchangeSuspensions, reasons } = await systemStatus.getSynthExchangeSuspensions(
					['sETH', 'sBTC', 'iBTC'].map(toBytes32)
				);
				assert.deepEqual(exchangeSuspensions, [true, true, false]);
				assert.deepEqual(reasons, [givenReason, givenReason, '0']);
			});
		});
	});

	describe('resumeSynthsExchange()', () => {
		let txn;
		const [sBTC, sETH] = ['sBTC', 'sETH'].map(toBytes32);

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeSynthsExchange,
				accounts,
				address: owner,
				args: [[sBTC, sETH]],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '55';
			beforeEach(async () => {
				await systemStatus.suspendSynthsExchange([sBTC, sETH], givenReason, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(SYNTH_EXCHANGE, account3, false, true, {
						from: owner,
					});
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeSynthsExchange([sBTC, sETH], { from: account3 });
					});

					it('it succeeds for sBTC', async () => {
						const { suspended, reason } = await systemStatus.synthExchangeSuspension(sBTC);
						assert.equal(suspended, false);
						assert.equal(reason, '0');
						assert.eventEqual(txn.logs[0], 'SynthExchangeResumed', [sBTC, givenReason]);
					});

					it('and for sETH', async () => {
						const { suspended, reason } = await systemStatus.synthExchangeSuspension(sETH);
						assert.equal(suspended, false);
						assert.equal(reason, '0');
						assert.eventEqual(txn.logs[1], 'SynthExchangeResumed', [sETH, givenReason]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireExchangeBetweenSynthsAllowed(sETH, sBTC);
						await systemStatus.requireSynthsActive(sBTC, sETH);
					});
				});
			});
		});
	});

	describe('suspendSynth()', () => {
		let txn;
		const sBTC = toBytes32('sBTC');

		it('is not suspended initially', async () => {
			const { suspended, reason } = await systemStatus.synthSuspension(sBTC);
			assert.equal(suspended, false);
			assert.equal(reason, '0');
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendSynth,
				accounts,
				address: owner,
				args: [sBTC, '0'],
				reason: 'Restricted to access control list',
			});
		});

		it('getSynthSuspensions(sETH, sBTC, iBTC) is empty', async () => {
			const { suspensions, reasons } = await systemStatus.getSynthSuspensions(
				['sETH', 'sBTC', 'iBTC'].map(toBytes32)
			);
			assert.deepEqual(suspensions, [false, false, false]);
			assert.deepEqual(reasons, ['0', '0', '0']);
		});

		describe('when the owner suspends', () => {
			const givenReason = '150';
			beforeEach(async () => {
				txn = await systemStatus.suspendSynth(sBTC, givenReason, { from: owner });
			});
			it('it succeeds', async () => {
				const { suspended, reason } = await systemStatus.synthSuspension(sBTC);
				assert.equal(suspended, true);
				assert.equal(reason, givenReason);
				assert.eventEqual(txn, 'SynthSuspended', [sBTC, reason]);
			});
			it('getSynthSuspensions(sETH, sBTC, iBTC) returns values for sBTC', async () => {
				const { suspensions, reasons } = await systemStatus.getSynthSuspensions(
					['sETH', 'sBTC', 'iBTC'].map(toBytes32)
				);
				assert.deepEqual(suspensions, [false, true, false]);
				assert.deepEqual(reasons, ['0', givenReason, '0']);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(SYNTH, account3, true, false, { from: owner });
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(
					systemStatus.suspendSynth(sBTC, '4', { from: account1 }),
					'Restricted to access control list'
				);
				await assert.revert(
					systemStatus.suspendSynth(sBTC, '0', { from: account2 }),
					'Restricted to access control list'
				);
			});

			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					txn = await systemStatus.suspendSynth(sBTC, '3', { from: account3 });
				});
				it('it succeeds', async () => {
					const { suspended, reason } = await systemStatus.synthSuspension(sBTC);
					assert.equal(suspended, true);
					assert.equal(reason, '3');
				});
				it('and emits the expected event', async () => {
					assert.eventEqual(txn, 'SynthSuspended', [sBTC, '3']);
				});
				it('and the synth require check reverts as expected', async () => {
					await assert.revert(
						systemStatus.requireSynthActive(sBTC),
						'Synth is suspended. Operation prohibited'
					);
				});
				it('but not the others', async () => {
					await systemStatus.requireSystemActive();
					await systemStatus.requireIssuanceActive();
				});
				it('and requireSynthsActive() reverts if one is the given synth', async () => {
					const reason = 'Synth is suspended. Operation prohibited';
					await assert.revert(systemStatus.requireSynthsActive(toBytes32('sETH'), sBTC), reason);
					await assert.revert(systemStatus.requireSynthsActive(sBTC, toBytes32('sTRX')), reason);
					await systemStatus.requireSynthsActive(toBytes32('sETH'), toBytes32('sUSD')); // no issues
					await systemStatus.requireSynthsActive(toBytes32('iTRX'), toBytes32('iBTC')); // no issues
				});
				it('and requireExchangeBetweenSynthsAllowed() reverts if one is the given synth', async () => {
					const reason = 'Synth is suspended. Operation prohibited';
					await assert.revert(
						systemStatus.requireExchangeBetweenSynthsAllowed(toBytes32('sETH'), sBTC),
						reason
					);
					await assert.revert(
						systemStatus.requireExchangeBetweenSynthsAllowed(sBTC, toBytes32('sTRX')),
						reason
					);
					await systemStatus.requireExchangeBetweenSynthsAllowed(
						toBytes32('sETH'),
						toBytes32('sUSD')
					); // no issues
					await systemStatus.requireExchangeBetweenSynthsAllowed(
						toBytes32('iTRX'),
						toBytes32('iBTC')
					); // no issues
				});
				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeSynth(sBTC, { from: account2 }),
						'Restricted to access control list'
					);
				});
				it('nor can it do any other restricted action', async () => {
					await assert.revert(
						systemStatus.updateAccessControl(SYNTH, account1, true, true, { from: account3 })
					);
					await assert.revert(systemStatus.suspendSystem('1', { from: account3 }));
					await assert.revert(systemStatus.resumeSystem({ from: account3 }));
					await assert.revert(systemStatus.suspendIssuance('1', { from: account3 }));
					await assert.revert(systemStatus.resumeIssuance({ from: account3 }));
				});
				it('yet the owner can still resume', async () => {
					await systemStatus.resumeSynth(sBTC, { from: owner });
				});
			});
		});
	});

	describe('resumeSynth()', () => {
		const sBTC = toBytes32('sBTC');

		let txn;
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeSynth,
				accounts,
				address: owner,
				args: [sBTC],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			const givenReason = '55';
			beforeEach(async () => {
				await systemStatus.suspendSynth(sBTC, givenReason, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(SYNTH, account3, false, true, { from: owner });
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(systemStatus.resumeSynth(sBTC, { from: account1 }));
					await assert.revert(systemStatus.resumeSynth(sBTC, { from: account2 }));
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						txn = await systemStatus.resumeSynth(sBTC, { from: account3 });
					});

					it('it succeeds', async () => {
						const { suspended, reason } = await systemStatus.synthSuspension(sBTC);
						assert.equal(suspended, false);
						assert.equal(reason, '0');
					});

					it('and emits the expected event', async () => {
						assert.eventEqual(txn, 'SynthResumed', [sBTC, givenReason]);
					});

					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireSynthActive(sBTC);
						await systemStatus.requireSynthsActive(sBTC, toBytes32('sETH'));
						await systemStatus.requireSynthsActive(toBytes32('sETH'), sBTC);
					});

					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendSynth(sBTC, givenReason, { from: account2 }),
							'Restricted to access control list'
						);
					});

					it('nor can it do any other restricted action', async () => {
						await assert.revert(
							systemStatus.updateAccessControl(SYSTEM, account1, false, true, { from: account3 })
						);
						await assert.revert(systemStatus.suspendSystem('0', { from: account3 }));
						await assert.revert(systemStatus.resumeSystem({ from: account3 }));
						await assert.revert(systemStatus.suspendIssuance('0', { from: account3 }));
						await assert.revert(systemStatus.resumeIssuance({ from: account3 }));
					});

					it('getSynthSuspensions(sETH, sBTC, iBTC) is empty', async () => {
						const { suspensions, reasons } = await systemStatus.getSynthSuspensions(
							['sETH', 'sBTC', 'iBTC'].map(toBytes32)
						);
						assert.deepEqual(suspensions, [false, false, false]);
						assert.deepEqual(reasons, ['0', '0', '0']);
					});
				});
			});
		});
	});

	describe('updateAccessControl()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.updateAccessControl,
				accounts,
				address: owner,
				args: [SYSTEM, account1, true, true],
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when invoked by the owner', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemStatus.updateAccessControl(SYNTH, account3, true, false, { from: owner });
			});

			it('then it emits the expected event', () => {
				assert.eventEqual(txn, 'AccessControlUpdated', [SYNTH, account3, true, false]);
			});

			it('and the user can perform the action', async () => {
				await systemStatus.suspendSynth(toBytes32('sETH'), '1', { from: account3 }); // succeeds without revert
			});

			describe('when overridden for the same user', () => {
				beforeEach(async () => {
					txn = await systemStatus.updateAccessControl(SYNTH, account3, false, false, {
						from: owner,
					});
				});

				it('then it emits the expected event', () => {
					assert.eventEqual(txn, 'AccessControlUpdated', [SYNTH, account3, false, false]);
				});

				it('and the user cannot perform the action', async () => {
					await assert.revert(
						systemStatus.suspendSynth(toBytes32('sETH'), '1', { from: account3 }),
						'Restricted to access control list'
					);
				});
			});
		});
	});
});
