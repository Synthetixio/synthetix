const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Nomin = artifacts.require('Nomin');

const { toUnit } = require('../utils/testUtils');

contract('SynthetixState', async function(accounts) {
	const nUSD = web3.utils.asciiToHex('nUSD');

	const [deployerAccount, owner, account1, account2] = accounts;

	let synthetix, synthetixState, nUSDContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.at(await synthetix.synthetixState());
		nUSDContract = await Nomin.at(await synthetix.nomins(nUSD));
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _owner, address _associatedContract)
		const instance = await SynthetixState.new(account1, account2, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.associatedContract(), account2);
	});

	it('should allow the owner to set the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		const transaction = await synthetixState.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should allow the owner to set the issuance ratio to zero', async function() {
		const ratio = web3.utils.toBN('0');

		const transaction = await synthetixState.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should disallow a non-owner from setting the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		await assert.revert(
			synthetixState.setIssuanceRatio(ratio, {
				from: account1,
			})
		);
	});

	it('should disallow setting the issuance ratio above the MAX ratio', async function() {
		const max = toUnit('1');

		// It should succeed when setting it to max
		const transaction = await synthetixState.setIssuanceRatio(max, {
			from: owner,
		});
		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: max });

		// But max + 1 should fail
		await assert.revert(
			synthetixState.setIssuanceRatio(web3.utils.toBN(max).add(web3.utils.toBN('1')), {
				from: account1,
			})
		);
	});

	it('should allow the associated contract to setCurrentIssuanceData', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });
		await synthetixState.setCurrentIssuanceData(account2, toUnit('0.1'), { from: account1 });
	});

	it('should disallow another address from calling setCurrentIssuanceData', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });
		await assert.revert(
			synthetixState.setCurrentIssuanceData(account2, toUnit('0.1'), { from: account2 })
		);
	});

	it('should allow the associated contract to clearIssuanceData', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });
		await synthetixState.setCurrentIssuanceData(account2, toUnit('0.1'), { from: account1 });
		await synthetixState.clearIssuanceData(account2, { from: account1 });
		assert.bnEqual((await synthetixState.issuanceData(account2)).initialDebtOwnership, 0);
	});

	it('should disallow another address from calling clearIssuanceData', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });
		await assert.revert(synthetixState.clearIssuanceData(account2, { from: account2 }));
	});

	it('should allow the associated contract to incrementTotalIssuerCount', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		await synthetixState.incrementTotalIssuerCount({ from: account1 });
		assert.bnEqual(await synthetixState.totalIssuerCount(), 1);
	});

	it('should disallow another address from calling incrementTotalIssuerCount', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });
		await assert.revert(synthetixState.incrementTotalIssuerCount({ from: account2 }));
	});

	it('should allow the associated contract to decrementTotalIssuerCount', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		// We need to increment first or we'll overflow on subtracting from zero and revert that way
		await synthetixState.incrementTotalIssuerCount({ from: account1 });
		await synthetixState.decrementTotalIssuerCount({ from: account1 });
		assert.bnEqual(await synthetixState.totalIssuerCount(), 0);
	});

	it('should disallow another address from calling decrementTotalIssuerCount', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		// We need to increment first or we'll overflow on subtracting from zero and revert that way
		await synthetixState.incrementTotalIssuerCount({ from: account1 });
		await assert.revert(synthetixState.decrementTotalIssuerCount({ from: account2 }));
	});

	it('should allow the associated contract to appendDebtLedgerValue', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		await synthetixState.appendDebtLedgerValue(toUnit('0.1'), { from: account1 });
		assert.bnEqual(await synthetixState.lastDebtLedgerEntry(), toUnit('0.1'));
	});

	it('should disallow another address from calling appendDebtLedgerValue', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		await assert.revert(synthetixState.appendDebtLedgerValue(toUnit('0.1'), { from: account2 }));
	});

	it('should allow the associated contract to setPreferredCurrency', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		await synthetixState.setPreferredCurrency(account2, nUSD, { from: account1 });
		assert.equal(await synthetixState.preferredCurrency(account2), nUSD);
	});

	it('should disallow another address from calling setPreferredCurrency', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		await assert.revert(synthetixState.setPreferredCurrency(account2, nUSD, { from: account2 }));
	});

	it('should correctly report debtLedgerLength', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		assert.bnEqual(await synthetixState.debtLedgerLength(), 0);
		await synthetixState.appendDebtLedgerValue(toUnit('0.1'), { from: account1 });
		assert.bnEqual(await synthetixState.debtLedgerLength(), 1);
	});

	it('should correctly report lastDebtLedgerEntry', async function() {
		await synthetixState.setAssociatedContract(account1, { from: owner });

		// Nothing in the array, so we should revert on invalid opcode
		await assert.invalidOpcode(synthetixState.lastDebtLedgerEntry());
		await synthetixState.appendDebtLedgerValue(toUnit('0.1'), { from: account1 });
		assert.bnEqual(await synthetixState.lastDebtLedgerEntry(), toUnit('0.1'));
	});

	it('should correctly report hasIssued for an address', async function() {
		assert.equal(await synthetixState.hasIssued(owner), false);

		await synthetix.issueMaxNomins(nUSD, { from: owner });
		const nominBalance = await nUSDContract.balanceOf(owner);

		assert.equal(await synthetixState.hasIssued(owner), true);

		await synthetix.burnNomins(nUSD, nominBalance, { from: owner });

		assert.equal(await synthetixState.hasIssued(owner), false);
	});
});
