const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, fromUnit, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('Nomin', async function(accounts) {
	const [nUSD, nAUD, nEUR, HAV, HDR, nXYZ] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR', 'nXYZ'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		feeAuthority,
		account1,
		account2,
		account3,
		account4,
		account5,
	] = accounts;

	let feePool,
		FEE_ADDRESS,
		havven,
		exchangeRates,
		nUSDContract,
		nAUDContract,
		nEURContract,
		HDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		havven = await Havven.deployed();
		nUSDContract = await Nomin.at(await havven.nomins(nUSD));
		nAUDContract = await Nomin.at(await havven.nomins(nAUD));
		nEURContract = await Nomin.at(await havven.nomins(nEUR));
		HDRContract = await Nomin.at(await havven.nomins(HDR));

		// Send a price update to guarantee we're not stale.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _proxy, TokenState _tokenState, Havven _havven, FeePool _feePool,
		// 	string _tokenName, string _tokenSymbol, address _owner, bytes4 _currencyKey
		// )
		const nomin = await Nomin.new(
			account1,
			account2,
			Havven.address,
			FeePool.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		assert.equal(await nomin.proxy(), account1);
		assert.equal(await nomin.tokenState(), account2);
		assert.equal(await nomin.havven(), Havven.address);
		assert.equal(await nomin.feePool(), FeePool.address);
		assert.equal(await nomin.name(), 'Nomin XYZ');
		assert.equal(await nomin.symbol(), 'nXYZ');
		assert.bnEqual(await nomin.decimals(), 18);
		assert.equal(await nomin.owner(), owner);
		assert.equal(await nomin.currencyKey(), nXYZ);
	});

	it('should allow the owner to set the Havven contract', async function() {
		assert.notEqual(await HDRContract.havven(), account1);

		const transaction = await HDRContract.setHavven(account1, { from: owner });
		assert.eventEqual(transaction, 'HavvenUpdated', { newHavven: account1 });

		assert.equal(await HDRContract.havven(), account1);
	});

	it('should disallow a non-owner from setting the Havven contract', async function() {
		await assert.revert(HDRContract.setHavven(account1, { from: account1 }));
	});

	it('should allow the owner to set the FeePool contract', async function() {
		assert.notEqual(await HDRContract.feePool(), account1);

		const transaction = await HDRContract.setFeePool(account1, { from: owner });
		assert.eventEqual(transaction, 'FeePoolUpdated', { newFeePool: account1 });

		assert.equal(await HDRContract.feePool(), account1);
	});

	it('should disallow a non-owner from setting the FeePool contract', async function() {
		await assert.revert(HDRContract.setFeePool(account1, { from: account1 }));
	});

	it('should transfer (ERC20) without error', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transfer(account1, amount, { from: owner });

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await nUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);
	});

	it('should revert when transferring (ERC20) with insufficient balance', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		// Try to transfer 10,000 + 1 wei, which we don't have the balance for.
		await assert.revert(
			nUSDContract.transfer(account1, amount.add(web3.utils.toBN('1')), { from: owner })
		);
	});

	it('should transfer (ERC223) without error', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transfer(
			account1,
			amount,
			web3.utils.asciiToHex('This is a test'),
			{ from: owner }
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await nUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);
	});

	it('should revert when transferring (ERC223) with insufficient balance', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		// Try to transfer 10,000 + 1 wei, which we don't have the balance for.
		await assert.revert(
			nUSDContract.transfer(
				account1,
				amount.add(web3.utils.toBN('1')),
				web3.utils.asciiToHex('This is a test'),
				{ from: owner }
			)
		);
	});

	it('should transferFrom (ERC20) without error', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Give account1 permission to act on our behalf
		await nUSDContract.approve(account1, amount, { from: owner });

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transferFrom(owner, account1, amount, {
			from: account1,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await nUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);

		// And allowance should be exhausted
		assert.bnEqual(await nUSDContract.allowance(owner, account1), 0);
	});

	it('should revert when calling transferFrom (ERC20) with insufficient allowance', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		// Approve for 1 wei less than amount
		await nUSDContract.approve(account1, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Try to transfer 10,000, which we don't have the allowance for.
		await assert.revert(nUSDContract.transferFrom(owner, account1, amount, { from: account1 }));
	});

	it('should revert when calling transferFrom (ERC20) with insufficient balance', async function() {
		// Issue 10,000 - 1 wei nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Approve for full amount
		await nUSDContract.approve(account1, amount, { from: owner });

		// Try to transfer 10,000, which we don't have the balance for.
		await assert.revert(nUSDContract.transferFrom(owner, account1, amount, { from: account1 }));
	});

	it('should transferFrom (ERC223) without error', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Give account1 permission to act on our behalf
		await nUSDContract.approve(account1, amount, { from: owner });

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transferFrom(
			owner,
			account1,
			amount,
			web3.utils.asciiToHex('This is a test'),
			{
				from: account1,
			}
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await nUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);

		// And allowance should be exhausted
		assert.bnEqual(await nUSDContract.allowance(owner, account1), 0);
	});

	it('should revert when calling transferFrom (ERC223) with insufficient allowance', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		// Approve for 1 wei less than amount
		await nUSDContract.approve(account1, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Try to transfer 10,000, which we don't have the allowance for.
		await assert.revert(
			nUSDContract.transferFrom(owner, account1, amount, web3.utils.asciiToHex('This is a test'), {
				from: account1,
			})
		);
	});

	it('should revert when calling transferFrom (ERC223) with insufficient balance', async function() {
		// Issue 10,000 - 1 wei nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Approve for full amount
		await nUSDContract.approve(account1, amount, { from: owner });

		// Try to transfer 10,000, which we don't have the balance for.
		await assert.revert(
			nUSDContract.transferFrom(owner, account1, amount, web3.utils.asciiToHex('This is a test'), {
				from: account1,
			})
		);
	});

	it('should transferSenderPaysFee without error', async function() {
		// Issue 10,000 nUSD.
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, startingBalance, { from: owner });

		const fee = await feePool.transferFeeIncurred(amount);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transferSenderPaysFee(account1, amount, { from: owner });

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have remainder
		assert.bnEqual(await nUSDContract.balanceOf(owner), startingBalance.sub(amount).sub(fee));

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), amount);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);
	});

	it('should transferSenderPaysFee with data without error');
	it('should transferFromSenderPaysFee without error');
	it('should transferFromSenderPaysFee with data without error');
	it('should issue successfully when called by Havven');
	it('should revert when issue is called by non-Havven address');
	it('should burn successfully when called by Havven');
	it('should revert when burn is called by non-Havven address');
	it('should triggerTokenFallback successfully when called by Havven');
	it('should triggerTokenFallback successfully when called by FeePool');
	it('should revert on triggerTokenFallback when called by non-Havven and non-FeePool address');
});
