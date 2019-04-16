const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');

const { currentTime, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract('Synth', async function(accounts) {
	const [sUSD, sAUD, sEUR, SNX, XDR, sXYZ] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'XDR', 'sXYZ'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
		account2,
	] = accounts;

	let feePool, FEE_ADDRESS, synthetix, exchangeRates, sUSDContract, sAUDContract, XDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		XDRContract = await Synth.at(await synthetix.synths(XDR));

		// Send a price update to guarantee we're not stale.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, FeePool _feePool,
		// 	string _tokenName, string _tokenSymbol, address _owner, bytes4 _currencyKey
		// )
		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		assert.equal(await synth.proxy(), account1);
		assert.equal(await synth.tokenState(), account2);
		assert.equal(await synth.synthetix(), Synthetix.address);
		assert.equal(await synth.feePool(), FeePool.address);
		assert.equal(await synth.name(), 'Synth XYZ');
		assert.equal(await synth.symbol(), 'sXYZ');
		assert.bnEqual(await synth.decimals(), 18);
		assert.equal(await synth.owner(), owner);
		assert.equal(await synth.currencyKey(), sXYZ);
	});

	it('should allow the owner to set the Synthetix contract', async function() {
		assert.notEqual(await XDRContract.synthetix(), account1);

		const transaction = await XDRContract.setSynthetix(account1, { from: owner });
		assert.eventEqual(transaction, 'SynthetixUpdated', { newSynthetix: account1 });

		assert.equal(await XDRContract.synthetix(), account1);
	});

	it('should disallow a non-owner from setting the Synthetix contract', async function() {
		await assert.revert(XDRContract.setSynthetix(account1, { from: account1 }));
	});

	it('should allow the owner to set the FeePool contract', async function() {
		assert.notEqual(await XDRContract.feePool(), account1);

		const transaction = await XDRContract.setFeePool(account1, { from: owner });
		assert.eventEqual(transaction, 'FeePoolUpdated', { newFeePool: account1 });

		assert.equal(await XDRContract.feePool(), account1);
	});

	it('should disallow a non-owner from setting the FeePool contract', async function() {
		await assert.revert(XDRContract.setFeePool(account1, { from: account1 }));
	});

	it('should transfer (ERC20) without error', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256)'](account1, amount, {
			from: owner,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should respect preferred currency when transferring', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		const sUSDReceived = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(sUSDReceived);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);
		const sAUDReceived = await synthetix.effectiveValue(sUSD, sUSDReceived, sAUD);

		assert.eventEqual(
			await synthetix.setPreferredCurrency(sAUD, { from: account1 }),
			'PreferredCurrencyChanged',
			{ account: account1, newPreferredCurrency: sAUD }
		);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256)'](account1, amount, {
			from: owner,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth exchange
			// from sUSD to sAUD
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: sUSDReceived },
			'Burned',
			{ account: owner, value: sUSDReceived },
			'Transfer',
			{ from: ZERO_ADDRESS, to: account1, value: sAUDReceived }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);
		assert.bnEqual(await sAUDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), 0);
		assert.bnEqual(await sAUDContract.balanceOf(account1), sAUDReceived);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should revert when transferring (ERC20) with insufficient balance', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// Try to transfer 10,000 + 1 wei, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transfer(address,uint256)'](
				account1,
				amount.add(web3.utils.toBN('1')),
				{ from: owner }
			)
		);
	});

	it('should transfer (ERC223) without error', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256,bytes)'](
			account1,
			amount,
			web3.utils.asciiToHex('This is a test'),
			{ from: owner }
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should revert when transferring (ERC223) with insufficient balance', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// Try to transfer 10,000 + 1 wei, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transfer(address,uint256,bytes)'](
				account1,
				amount.add(web3.utils.toBN('1')),
				web3.utils.asciiToHex('This is a test'),
				{ from: owner }
			)
		);
	});

	it('should transferFrom (ERC20) without error', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Give account1 permission to act on our behalf
		await sUSDContract.approve(account1, amount, { from: owner });

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transferFrom(address,address,uint256)'](
			owner,
			account1,
			amount,
			{
				from: account1,
			}
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);

		// And allowance should be exhausted
		assert.bnEqual(await sUSDContract.allowance(owner, account1), 0);
	});

	it('should revert when calling transferFrom (ERC20) with insufficient allowance', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// Approve for 1 wei less than amount
		await sUSDContract.approve(account1, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Try to transfer 10,000, which we don't have the allowance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256)'](owner, account1, amount, {
				from: account1,
			})
		);
	});

	it('should revert when calling transferFrom (ERC20) with insufficient balance', async function() {
		// Issue 10,000 - 1 wei sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Approve for full amount
		await sUSDContract.approve(account1, amount, { from: owner });

		// Try to transfer 10,000, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256)'](owner, account1, amount, {
				from: account1,
			})
		);
	});

	it('should transferFrom (ERC223) without error', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Give account1 permission to act on our behalf
		await sUSDContract.approve(account1, amount, { from: owner });

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transferFrom(address,address,uint256,bytes)'](
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

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);

		// And allowance should be exhausted
		assert.bnEqual(await sUSDContract.allowance(owner, account1), 0);
	});

	it('should revert when calling transferFrom (ERC223) with insufficient allowance', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// Approve for 1 wei less than amount
		await sUSDContract.approve(account1, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Try to transfer 10,000, which we don't have the allowance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256,bytes)'](
				owner,
				account1,
				amount,
				web3.utils.asciiToHex('This is a test'),
				{
					from: account1,
				}
			)
		);
	});

	it('should revert when calling transferFrom (ERC223) with insufficient balance', async function() {
		// Issue 10,000 - 1 wei sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount.sub(web3.utils.toBN('1')), { from: owner });

		// Approve for full amount
		await sUSDContract.approve(account1, amount, { from: owner });

		// Try to transfer 10,000, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256,bytes)'](
				owner,
				account1,
				amount,
				web3.utils.asciiToHex('This is a test'),
				{
					from: account1,
				}
			)
		);
	});

	it('should transferSenderPaysFee without error', async function() {
		// Issue 10,000 sUSD.
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		const fee = await feePool.transferFeeIncurred(amount);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transferSenderPaysFee(address,uint256)'](
			account1,
			amount,
			{ from: owner }
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have remainder
		assert.bnEqual(await sUSDContract.balanceOf(owner), startingBalance.sub(amount).sub(fee));

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should revert when calling transferSenderPaysFee with insufficient balance', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// Try to send 1 more wei than we can.
		const amountToSend = (await feePool.transferredAmountToReceive(amount)).add(
			web3.utils.toBN('1')
		);

		// Try to transfer, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transferSenderPaysFee(address,uint256)'](account1, amountToSend, {
				from: owner,
			})
		);
	});

	it('should transferSenderPaysFee with data without error', async function() {
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		const fee = await feePool.transferFeeIncurred(amount);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transferSenderPaysFee(address,uint256,bytes)'](
			account1,
			amount,
			web3.utils.asciiToHex('This is a test'),
			{ from: owner }
		);

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have remainder
		assert.bnEqual(await sUSDContract.balanceOf(owner), startingBalance.sub(amount).sub(fee));

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should transferFromSenderPaysFee without error', async function() {
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		const fee = await feePool.transferFeeIncurred(amount);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		await sUSDContract.approve(account1, startingBalance, { from: owner });

		// Do a single transfer of all our sUSD.
		// eslint-disable-next-line standard/computed-property-even-spacing
		const transaction = await sUSDContract.methods[
			'transferFromSenderPaysFee(address,address,uint256)'
		](owner, account1, amount, {
			from: account1,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have remainder
		assert.bnEqual(await sUSDContract.balanceOf(owner), startingBalance.sub(amount).sub(fee));

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should revert when calling transferFromSenderPaysFee with an insufficent allowance', async function() {
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		await sUSDContract.approve(account1, amount, { from: owner });

		// Trying to transfer will exceed our allowance.
		await assert.revert(
			sUSDContract.methods['transferFromSenderPaysFee(address,address,uint256)'](
				owner,
				account1,
				amount,
				{
					from: account1,
				}
			)
		);
	});

	it('should revert when calling transferFromSenderPaysFee with an insufficent balance', async function() {
		const approvalAmount = toUnit('12000');
		const startingBalance = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		await sUSDContract.approve(account1, approvalAmount, { from: owner });

		// Trying to transfer will exceed our balance.
		await assert.revert(
			sUSDContract.methods['transferFromSenderPaysFee(address,address,uint256)'](
				owner,
				account1,
				startingBalance,
				{
					from: account1,
				}
			)
		);
	});

	it('should transferFromSenderPaysFee with data without error', async function() {
		const startingBalance = toUnit('12000');
		const amount = toUnit('10000');
		await synthetix.issueSynths(sUSD, startingBalance, { from: owner });

		const fee = await feePool.transferFeeIncurred(amount);
		const xdrFee = await synthetix.effectiveValue(sUSD, fee, XDR);

		await sUSDContract.approve(account1, startingBalance, { from: owner });

		// Do a single transfer of all our sUSD.
		// eslint-disable-next-line standard/computed-property-even-spacing
		const transaction = await sUSDContract.methods[
			'transferFromSenderPaysFee(address,address,uint256,bytes)'
		](owner, account1, amount, web3.utils.asciiToHex('This is a test'), {
			from: account1,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to XDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, value: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: xdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, value: xdrFee },

			// And finally the original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have remainder
		assert.bnEqual(await sUSDContract.balanceOf(owner), startingBalance.sub(amount).sub(fee));

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// The fee pool should also have the correct amount
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), xdrFee);
	});

	it('should issue successfully when called by Synthetix', async function() {
		// Set it to us so we can call it easily
		await XDRContract.setSynthetix(owner, { from: owner });

		const transaction = await XDRContract.issue(account1, toUnit('10000'), { from: owner });
		assert.eventsEqual(
			transaction,
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: account1,
				value: toUnit('10000'),
			},
			'Issued',
			{
				account: account1,
				value: toUnit('10000'),
			}
		);
	});

	it('should revert when issue is called by non-Synthetix address', async function() {
		await XDRContract.setSynthetix(synthetix.address, { from: owner });
		await assert.revert(XDRContract.issue(account1, toUnit('10000'), { from: owner }));
	});

	it('should burn successfully when called by Synthetix', async function() {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(XDR, toUnit('10000'), { from: owner });

		// Set the synthetix reference to us so we can call it easily
		await XDRContract.setSynthetix(owner, { from: owner });

		const transaction = await XDRContract.burn(owner, toUnit('10000'), { from: owner });

		assert.eventsEqual(
			transaction,
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: toUnit('10000') },
			'Burned',
			{ account: owner, value: toUnit('10000') }
		);
	});

	it('should revert when burn is called by non-Synthetix address', async function() {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(XDR, toUnit('10000'), { from: owner });

		// Set the synthetix reference to account1
		await XDRContract.setSynthetix(account1, { from: owner });

		// Burning should fail.
		await assert.revert(XDRContract.burn(owner, toUnit('10000'), { from: owner }));
	});

	it('should revert when burning more synths than exist', async function() {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(XDR, toUnit('10000'), { from: owner });

		// Set the synthetix reference to us so we can call it easily
		await XDRContract.setSynthetix(owner, { from: owner });

		// Burning 10000 + 1 wei should fail.
		await assert.revert(
			XDRContract.burn(owner, toUnit('10000').add(web3.utils.toBN('1')), { from: owner })
		);
	});

	it('should triggerTokenFallback successfully when called by Synthetix', async function() {
		// Set the synthetix reference to us so we can call it easily
		await XDRContract.setSynthetix(owner, { from: owner });
		await XDRContract.triggerTokenFallbackIfNeeded(ZERO_ADDRESS, ZERO_ADDRESS, toUnit('1'), {
			from: owner,
		});
	});

	it('should triggerTokenFallback successfully when called by FeePool', async function() {
		// Set the FeePool reference to us so we can call it easily
		await XDRContract.setFeePool(owner, { from: owner });
		await XDRContract.triggerTokenFallbackIfNeeded(ZERO_ADDRESS, ZERO_ADDRESS, toUnit('1'), {
			from: owner,
		});
	});

	it('should revert on triggerTokenFallback when called by non-Synthetix and non-FeePool address', async function() {
		await assert.revert(
			XDRContract.triggerTokenFallbackIfNeeded(ZERO_ADDRESS, ZERO_ADDRESS, toUnit('1'), {
				from: owner,
			})
		);
	});

	it('should transfer (ERC20) with no fee', async function() {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');

		await synthetix.issueSynths(sUSD, amount, { from: owner });

		// set transferFee on feepool to 0
		await feePool.setTransferFeeRate(0, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256)'](account1, amount, {
			from: owner,
		});

		// Event should be only a transfer to account1
		assert.eventEqual(
			transaction,

			// The original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(fee, 0);
		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), received);

		// The fee pool should have zero balance
		assert.bnEqual(await XDRContract.balanceOf(FEE_ADDRESS), 0);
	});
});
