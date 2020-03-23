require('.'); // import common test scaffolding

const SystemStatus = artifacts.require('SystemStatus');

const {
	// currentTime,
	// fastForward,
	// multiplyDecimal,
	// divideDecimal,
	// toUnit,
	// ZERO_ADDRESS,
} = require('../utils/testUtils');

const {
	// issueSynthsToUser,
	// setExchangeFee,
	// getDecodedLogs,
	// decodedEventEqual,
	// timeIsClose,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('../utils/setupUtils');

const { toBytes32 } = require('../..');

contract('SystemStatus', async accounts => {
	const [SYSTEM, ISSUANCE, SYNTH] = ['System', 'Issuance', 'Synth'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let systemStatus;

	beforeEach(async () => {
		systemStatus = await SystemStatus.deployed();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: systemStatus.abi,
			ignoreParents: ['Owned'],
			expected: [
				'suspendSystem',
				'resumeSystem',
				'suspendIssuance',
				'resumeIssuance',
				'suspendSynth',
				'resumeSynth',
				'updateAccessControl',
			],
		});
	});

	describe('suspendSystem()', () => {
		it('is not suspended initially', async () => {
			const systemSuspended = await systemStatus.systemSuspended();
			assert.equal(systemSuspended, false);
		});

		it('and all the require checks succeed', async () => {
			await systemStatus.requireSystemActive();
			await systemStatus.requireIssuanceActive();
			await systemStatus.requireSynthActive(toBytes32('sETH'));
		});

		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.suspendSystem,
				accounts,
				address: owner,
				args: [true],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			beforeEach(async () => {
				await systemStatus.suspendSystem(false, { from: owner });
			});
			it('it succeeds', async () => {
				const systemSuspended = await systemStatus.systemSuspended();
				assert.equal(systemSuspended, true);
			});
			it('and the require checks all revert as expected', async () => {
				await assert.revert(
					systemStatus.requireSystemActive(),
					'Synthetix is suspended. Operation prohibited'
				);
				await assert.revert(
					systemStatus.requireIssuanceActive(),
					'Synthetix is suspended. Operation prohibited'
				);
				await assert.revert(
					systemStatus.requireSynthActive(toBytes32('sETH')),
					'Synthetix is suspended. Operation prohibited'
				);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(account1, SYSTEM, true, false, { from: owner });
			});

			it('other addresses still cannot suspend', async () => {
				await assert.revert(systemStatus.suspendSystem(true, { from: account2 }));
				await assert.revert(systemStatus.suspendSystem(false, { from: account3 }));
			});

			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					await systemStatus.suspendSystem(true, { from: account1 });
				});
				it('it succeeds', async () => {
					const systemSuspended = await systemStatus.systemSuspended();
					assert.equal(systemSuspended, true);
				});
				it('and the require checks all revert as expected', async () => {
					const reason = 'Synthetix is suspended, upgrade in progress... please stand by';
					await assert.revert(systemStatus.requireSystemActive(), reason);
					await assert.revert(systemStatus.requireIssuanceActive(), reason);
					await assert.revert(systemStatus.requireSynthActive(toBytes32('sETH')), reason);
				});
				it('yet that address cannot resume', async () => {
					await assert.revert(
						systemStatus.resumeSystem({ from: account1 }),
						'Restricted to access control list'
					);
				});
				it('nor can it do any other restricted action', async () => {
					await assert.revert(
						systemStatus.updateAccessControl(account2, SYSTEM, true, true, { from: account1 })
					);
					await assert.revert(systemStatus.suspendIssuance({ from: account1 }));
					await assert.revert(systemStatus.resumeIssuance({ from: account1 }));
					await assert.revert(systemStatus.suspendSynth(toBytes32('sETH'), { from: account1 }));
					await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account1 }));
				});
			});
		});
	});

	describe('resumeSystem()', () => {
		it('can only be invoked by the owner initially', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemStatus.resumeSystem,
				accounts,
				address: owner,
				args: [],
				reason: 'Restricted to access control list',
			});
		});

		describe('when the owner suspends', () => {
			beforeEach(async () => {
				await systemStatus.suspendSystem(false, { from: owner });
			});

			describe('when the owner adds an address to resume only', () => {
				beforeEach(async () => {
					await systemStatus.updateAccessControl(account1, SYSTEM, false, true, { from: owner });
				});

				it('other addresses still cannot resume', async () => {
					await assert.revert(systemStatus.resumeSystem({ from: account2 }));
					await assert.revert(systemStatus.resumeSystem({ from: account3 }));
				});

				describe('and that address invokes resume', () => {
					beforeEach(async () => {
						await systemStatus.resumeSystem({ from: account1 });
					});
					it('it succeeds', async () => {
						const systemSuspended = await systemStatus.systemSuspended();
						assert.equal(systemSuspended, false);
					});
					it('and all the require checks succeed', async () => {
						await systemStatus.requireSystemActive();
						await systemStatus.requireIssuanceActive();
						await systemStatus.requireSynthActive(toBytes32('sETH'));
					});
					it('yet that address cannot suspend', async () => {
						await assert.revert(
							systemStatus.suspendSystem(false, { from: account1 }),
							'Restricted to access control list'
						);
					});
					it('nor can it do any other restricted action', async () => {
						await assert.revert(
							systemStatus.updateAccessControl(account2, SYSTEM, false, true, { from: account1 })
						);
						await assert.revert(systemStatus.suspendIssuance({ from: account1 }));
						await assert.revert(systemStatus.resumeIssuance({ from: account1 }));
						await assert.revert(systemStatus.suspendSynth(toBytes32('sETH'), { from: account1 }));
						await assert.revert(systemStatus.resumeSynth(toBytes32('sETH'), { from: account1 }));
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
				args: [account1, SYSTEM, true, true],
				reason: 'Only the contract owner may perform this action',
			});
		});
	});
});
