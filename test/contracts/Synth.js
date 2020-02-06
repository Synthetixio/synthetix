require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const SynthetixProxy = artifacts.require('Proxy');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const AddressResolver = artifacts.require('AddressResolver');

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

	let feePool, FEE_ADDRESS, synthetixProxy, synthetix, exchangeRates, sUSDContract, addressResolver;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		synthetixProxy = await SynthetixProxy.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));

		addressResolver = await AddressResolver.deployed();

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
			'Synth XYZ',
			'sXYZ',
			owner,
			toBytes32('sXYZ'),
			web3.utils.toWei('100'),
			addressResolver.address,
			{ from: deployerAccount }
		);

		assert.equal(await synth.proxy(), account1);
		assert.equal(await synth.tokenState(), account2);
		assert.equal(await synth.name(), 'Synth XYZ');
		assert.equal(await synth.symbol(), 'sXYZ');
		assert.bnEqual(await synth.decimals(), 18);
		assert.equal(await synth.owner(), owner);
		assert.equal(bytesToString(await synth.currencyKey()), 'sXYZ');
		assert.bnEqual(await synth.totalSupply(), toUnit('100'));
		assert.equal(await synth.resolver(), addressResolver.address);
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
		const transaction = await sUSDContract.transferFrom(owner, account1, amount, {
			from: account1,
		});

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
		// Overwrite Synthetix address to the owner to allow us to invoke issue on the Synth
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [owner], { from: owner });
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
		await assert.revert(sUSDContract.issue(account1, toUnit('10000'), { from: owner }));
	});

	it('should burn successfully when called by Synthetix', async () => {
		// Issue a bunch of synths so we can play with them.
		await synthetix.issueSynths(toUnit('10000'), { from: owner });

		// In order to invoke burn as the owner, temporarily overwrite the Synthetix address
		// in the resolver
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [owner], { from: owner });
		const transaction = await sUSDContract.burn(owner, toUnit('10000'), { from: owner });
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
			from: owner,
		});

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
});
