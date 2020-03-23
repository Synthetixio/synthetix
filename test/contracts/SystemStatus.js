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
			await systemStatus.requireSystemActive();
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
				await assert.revert(
					systemStatus.requireSystemActive(),
					'Synthetix is suspended. Operation prohibited'
				);
			});
		});

		describe('when the owner adds an address to suspend only', () => {
			beforeEach(async () => {
				await systemStatus.updateAccessControl(account1, SYSTEM, true, false, { from: owner });
			});
			describe('and that address invokes suspend', () => {
				beforeEach(async () => {
					await systemStatus.suspendSystem(true, { from: account1 });
				});
				it('it succeeds', async () => {
					const systemSuspended = await systemStatus.systemSuspended();
					assert.equal(systemSuspended, true);
					await assert.revert(
						systemStatus.requireSystemActive(),
						'Synthetix is suspended, upgrade in progress... please stand by'
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

		describe('by default, user has no access to any control', () => {});
	});
});
