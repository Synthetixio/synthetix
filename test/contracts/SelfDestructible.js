require('.'); // import common test scaffolding

const SelfDestructible = artifacts.require('SelfDestructible');

const { fastForward } = require('../utils/testUtils');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('../utils/setupUtils');

contract('SelfDestructible', async accounts => {
	const SELFDESTRUCT_DELAY = 2419200;

	const [deployerAccount, owner, account1] = accounts;

	let instance;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		instance = await SelfDestructible.new(owner, {
			from: deployerAccount,
		});
	});
	it('on instantiation, the beneficiary is the owner', async () => {
		assert.equal(await instance.selfDestructBeneficiary(), owner);
	});
	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned'],
			expected: [
				'setSelfDestructBeneficiary',
				'initiateSelfDestruct',
				'terminateSelfDestruct',
				'selfDestruct',
			],
		});
	});
	describe('setSelfDestructBeneficiary()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.setSelfDestructBeneficiary,
				accounts,
				address: owner,
				args: [account1],
			});
		});
		it('when invoked, it sets the beneficiary', async () => {
			const txn = await instance.setSelfDestructBeneficiary(account1, { from: owner });
			assert.equal(await instance.selfDestructBeneficiary(), account1);
			assert.eventEqual(txn, 'SelfDestructBeneficiaryUpdated', { newBeneficiary: account1 });
		});
	});

	describe('initiateSelfDestruct()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.initiateSelfDestruct,
				accounts,
				address: owner,
				args: [],
			});
		});
		it('when invoked, it sets the flag', async () => {
			assert.equal(await instance.selfDestructInitiated(), false);
			assert.equal(await instance.initiationTime(), '0');
			const txn = await instance.initiateSelfDestruct({ from: owner });
			assert.equal(await instance.selfDestructInitiated(), true);
			assert.ok((await instance.initiationTime()).gt(0));
			assert.eventEqual(txn, 'SelfDestructInitiated', { selfDestructDelay: SELFDESTRUCT_DELAY });
		});
	});

	describe('terminateSelfDestruct()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.terminateSelfDestruct,
				accounts,
				address: owner,
				args: [],
			});
		});
		it('when invoked, it does nothing', async () => {
			assert.equal(await instance.selfDestructInitiated(), false);
			const txn = await instance.terminateSelfDestruct({ from: owner });
			assert.equal(await instance.selfDestructInitiated(), false);
			assert.eventEqual(txn, 'SelfDestructTerminated', []);
		});
		describe('when initiateSelfDestruct() has been called', () => {
			beforeEach(async () => {
				await instance.initiateSelfDestruct({ from: owner });
			});
			it('when terminateSelfDestruct() invoked, it unsets the flag and time', async () => {
				assert.equal(await instance.selfDestructInitiated(), true);
				assert.ok((await instance.initiationTime()).gt(0));
				const txn = await instance.terminateSelfDestruct({ from: owner });
				assert.equal(await instance.selfDestructInitiated(), false);
				assert.equal(await instance.initiationTime(), '0');
				assert.eventEqual(txn, 'SelfDestructTerminated', []);
			});
		});
	});

	describe('selfDestruct()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.selfDestruct,
				accounts,
				skipPassCheck: true, // don't call now as it will fail without setup
				address: owner,
				args: [],
			});
		});
		describe('when initiateSelfDestruct() is invoked', () => {
			beforeEach(async () => {
				await instance.initiateSelfDestruct({ from: owner });
			});
			it('selfDestruct() fails as no delay elapsed', async () => {
				await assert.revert(instance.selfDestruct({ from: owner }));
			});
			describe('when delay elapses', () => {
				beforeEach(async () => {
					await fastForward(SELFDESTRUCT_DELAY + 1);
				});
				it('then selfDestruct succeeds', async () => {
					const transaction = await instance.selfDestruct({ from: owner });
					assert.eventEqual(transaction, 'SelfDestructed', {
						beneficiary: owner,
					});
				});
			});
		});
	});
});
