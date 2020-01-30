require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePoolProxy = artifacts.require('Proxy');
const FeePool = artifacts.require('FeePool');
const SynthetixProxy = artifacts.require('Proxy');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');

const { currentTime, toUnit, ZERO_ADDRESS, bytesToString } = require('../utils/testUtils');
const { toBytes32 } = require('../..');

contract('Synth', async accounts => {
	const [sUSD, sAUD, sEUR, SNX] = ['sUSD', 'sAUD', 'sEUR', 'SNX'].map(toBytes32);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
		account2,
	] = accounts;

	let feePoolProxy,
		feePool,
		FEE_ADDRESS,
		synthetixProxy,
		synthetix,
		exchangeRates,
		sUSDContract,
		sEURContract;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		synthetixProxy = await SynthetixProxy.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));

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

	it('should set constructor params on deployment', async () => {
		// address _proxy, TokenState _tokenState, address _synthetixProxy, address _feePoolProxy,
		// string _tokenName, string _tokenSymbol, address _owner, bytes32 _currencyKey, uint _totalSupply)
		const synth = await Synth.new(
			account1,
			account2,
			synthetix.address,
			feePoolProxy.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			toBytes32('sXYZ'),
			web3.utils.toWei('100'),
			{ from: deployerAccount }
		);

		assert.equal(await synth.proxy(), account1);
		assert.equal(await synth.tokenState(), account2);
		assert.equal(await synth.synthetixProxy(), synthetix.address);
		assert.equal(await synth.feePoolProxy(), FeePoolProxy.address);
		assert.equal(await synth.name(), 'Synth XYZ');
		assert.equal(await synth.symbol(), 'sXYZ');
		assert.bnEqual(await synth.decimals(), 18);
		assert.equal(await synth.owner(), owner);
		assert.equal(bytesToString(await synth.currencyKey()), 'sXYZ');
		assert.bnEqual(await synth.totalSupply(), toUnit('100'));
	});

	it('should allow the owner to set the Synthetix contract', async () => {
		assert.notEqual(await sUSDContract.synthetixProxy(), account1);

		const transaction = await sUSDContract.setSynthetixProxy(account1, {
			from: owner,
		});
		assert.eventEqual(transaction, 'SynthetixUpdated', {
			newSynthetix: account1,
		});

		assert.equal(await sUSDContract.synthetixProxy(), account1);
	});

	it('should disallow a non-owner from setting the Synthetix contract', async () => {
		await assert.revert(sUSDContract.setSynthetixProxy(account1, { from: account1 }));
	});

	it('should allow the owner to set the FeePool contract', async () => {
		assert.notEqual(await sUSDContract.feePoolProxy(), account1);

		const transaction = await sUSDContract.setFeePoolProxy(account1, {
			from: owner,
		});
		assert.eventEqual(transaction, 'FeePoolUpdated', { newFeePool: account1 });

		assert.equal(await sUSDContract.feePoolProxy(), account1);
	});

	it('should disallow a non-owner from setting the FeePool contract', async () => {
		await assert.revert(sUSDContract.setFeePoolProxy(account1, { from: account1 }));
	});

	it('should transfer (ERC20) without error', async () => {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(amount, { from: owner });

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256)'](account1, amount, {
			from: owner,
		});

		// Events should be a fee exchange and a transfer to account1
		assert.eventEqual(
			transaction,
			// The original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);
	});

	it('should revert when transferring (ERC20) with insufficient balance', async () => {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(amount, { from: owner });

		// Try to transfer 10,000 + 1 wei, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transfer(address,uint256)'](
				account1,
				amount.add(web3.utils.toBN('1')),
				{ from: owner }
			)
		);
	});

	it('should transferFrom (ERC20) without error', async () => {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(amount, { from: owner });

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

		// Events should be a transfer to account1
		assert.eventEqual(
			transaction,
			// The original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// And allowance should be exhausted
		assert.bnEqual(await sUSDContract.allowance(owner, account1), 0);
	});

	it('should revert when calling transferFrom (ERC20) with insufficient allowance', async () => {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(amount, { from: owner });

		// Approve for 1 wei less than amount
		await sUSDContract.approve(account1, amount.sub(web3.utils.toBN('1')), {
			from: owner,
		});

		// Try to transfer 10,000, which we don't have the allowance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256)'](owner, account1, amount, {
				from: account1,
			})
		);
	});

	it('should revert when calling transferFrom (ERC20) with insufficient balance', async () => {
		// Issue 10,000 - 1 wei sUSD.
		const amount = toUnit('10000');
		await synthetix.issueSynths(amount.sub(web3.utils.toBN('1')), { from: owner });

		// Approve for full amount
		await sUSDContract.approve(account1, amount, { from: owner });

		// Try to transfer 10,000, which we don't have the balance for.
		await assert.revert(
			sUSDContract.methods['transferFrom(address,address,uint256)'](owner, account1, amount, {
				from: account1,
			})
		);
	});

	it('should issue successfully when called by Synthetix', async () => {
		// Set it to us so we can call it easily
		await synthetixProxy.setTarget(owner, { from: owner });
		await sUSDContract.setSynthetixProxy(synthetixProxy.address, {
			from: owner,
		});

		const transaction = await sUSDContract.issue(account1, toUnit('10000'), {
			from: owner,
		});
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

	it('should revert when issue is called by non-Synthetix address', async () => {
		// Set the target of the SynthetixProxy to account1
		await synthetixProxy.setTarget(account1, { from: owner });

		await assert.revert(sUSDContract.issue(account1, toUnit('10000'), { from: owner }));
	});

	it('should burn successfully when called by Synthetix', async () => {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(toUnit('10000'), { from: owner });

		// Set the Synthetix target of the SynthetixProxy to owner
		await synthetixProxy.setTarget(owner, { from: owner });
		await sUSDContract.setSynthetixProxy(synthetixProxy.address, { from: owner });

		const transaction = await sUSDContract.burn(owner, toUnit('10000'), { from: owner });

		assert.eventsEqual(
			transaction,
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: toUnit('10000') },
			'Burned',
			{ account: owner, value: toUnit('10000') }
		);
	});

	it('should revert when burn is called by non-Synthetix address', async () => {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(toUnit('10000'), { from: owner });

		// Set the Synthetix target of the SynthetixProxy to owner
		await synthetixProxy.setTarget(account1, { from: owner });
		await sUSDContract.setSynthetixProxy(synthetixProxy.address, { from: owner });

		// Burning should fail.
		await assert.revert(sUSDContract.burn(owner, toUnit('10000'), { from: owner }));
	});

	it('should revert when burning more synths than exist', async () => {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(toUnit('10000'), { from: owner });

		// Set the Synthetix target of the SynthetixProxy to owner
		await synthetixProxy.setTarget(owner, { from: owner });

		// Burning 10000 + 1 wei should fail.
		await assert.revert(
			sUSDContract.burn(owner, toUnit('10000').add(web3.utils.toBN('1')), { from: owner })
		);
	});

	it('should transfer (ERC20) with no fee', async () => {
		// Issue 10,000 sUSD.
		const amount = toUnit('10000');

		await synthetix.issueSynths(amount, { from: owner });

		// Do a single transfer of all our sUSD.
		const transaction = await sUSDContract.methods['transfer(address,uint256)'](account1, amount, {
			from: owner,
		});

		// Event should be only a transfer to account1
		assert.eventEqual(
			transaction,

			// The original synth transfer
			'Transfer',
			{ from: owner, to: account1, value: amount }
		);

		// Sender should have nothing
		assert.bnEqual(await sUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await sUSDContract.balanceOf(account1), amount);

		// The fee pool should have zero balance
		assert.bnEqual(await sUSDContract.balanceOf(FEE_ADDRESS), 0);
	});

	describe('when transferring synths to FEE_ADDRESS', async () => {
		let amount;
		beforeEach(async () => {
			// Issue 10,000 sUSD.
			amount = toUnit('10000');

			await synthetix.issueSynths(amount, { from: owner });
		});
		it('should transfer to FEE_ADDRESS and recorded as fee', async () => {
			const feeBalanceBefore = await sUSDContract.balanceOf(FEE_ADDRESS);

			// Do a single transfer of all our sUSD.
			const transaction = await sUSDContract.transfer(FEE_ADDRESS, amount, {
				from: owner,
			});

			// Event should be only a transfer to FEE_ADDRESS
			assert.eventEqual(
				transaction,

				// The original synth transfer
				'Transfer',
				{ from: owner, to: FEE_ADDRESS, value: amount }
			);

			const firstFeePeriod = await feePool.recentFeePeriods(0);
			// FEE_ADDRESS balance of sUSD increased
			assert.bnEqual(await sUSDContract.balanceOf(FEE_ADDRESS), feeBalanceBefore.add(amount));

			// fees equal to amount are recorded in feesToDistribute
			assert.bnEqual(firstFeePeriod.feesToDistribute, feeBalanceBefore.add(amount));
		});
		it('should transfer to FEE_ADDRESS and exchange non-sUSD synths', async () => {
			// Exchange all synths to sEUR.
			await synthetix.exchange(sUSD, amount, sEUR, {
				from: owner,
			});

			// Get balanceOf FEE_ADDRESS
			const feeBalanceBefore = await sUSDContract.balanceOf(FEE_ADDRESS);

			// balance of sEUR after exchange fees
			const balanceOf = await sEURContract.balanceOf(owner);

			const amountInUSD = await exchangeRates.effectiveValue(sEUR, balanceOf, sUSD);

			// Do a single transfer of all sEUR to FEE_ADDRESS
			await sEURContract.transfer(FEE_ADDRESS, balanceOf, {
				from: owner,
			});

			const firstFeePeriod = await feePool.recentFeePeriods(0);

			// FEE_ADDRESS balance of sUSD increased by USD amount given from exchange
			assert.bnEqual(await sUSDContract.balanceOf(FEE_ADDRESS), feeBalanceBefore.add(amountInUSD));

			// fees equal to amountInUSD are recorded in feesToDistribute
			assert.bnEqual(firstFeePeriod.feesToDistribute, feeBalanceBefore.add(amountInUSD));
		});
	});
});
