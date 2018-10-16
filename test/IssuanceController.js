const Havven = artifacts.require('Havven');
const IssuanceController = artifacts.require('IssuanceController');
const Nomin = artifacts.require('Nomin');

contract.skip('Issuance Controller', async function(accounts) {
	const [
		deployerAccount,
		owner,
		oracle,
		fundsWallet,
		address1,
		address2,
		address3,
		address4,
	] = accounts;

	it('should set constructor params on deployment', async function() {
		const havven = await Havven.deployed();
		const nomin = await Nomin.deployed();

		let usdEth = '274957049546843687330';
		let usdHav = '127474638738934625';

		const instance = await IssuanceController.new(
			owner,
			fundsWallet,
			havven.address,
			nomin.address,
			oracle,
			usdEth,
			usdHav,
			{
				from: deployerAccount,
			}
		);

		assert.equal(havven.address, await instance.havven());
		assert.equal(nomin.address, await instance.nomin());
		assert.equal(fundsWallet, await instance.fundsWallet());
		assert.equal(oracle, await instance.oracle());
		assert.equal(usdHav, (await instance.usdToHavPrice()).toString());
		assert.equal(usdEth, (await instance.usdToEthPrice()).toString());
	});

	it('should set funds wallet when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setFundsWallet(address1, { from: owner });
		assert.eventEqual(txn, 'FundsWalletUpdated', { newFundsWallet: address1 });

		assert.equal(await issuanceController.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		const currentFundsWallet = await issuanceController.fundsWallet();

		await assert.revert(issuanceController.setFundsWallet(address2, { from: deployerAccount }));

		assert.equal(await issuanceController.fundsWallet(), currentFundsWallet);
	});

	it('should set oracle when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setOracle(address2, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', { newOracle: address2 });

		assert.equal(await issuanceController.oracle(), address2);
	});

	it('should not set oracle when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		await assert.revert(issuanceController.setOracle(address3, { from: deployerAccount }));

		assert.equal(await issuanceController.oracle(), oracle);
	});

	it('should set nomin when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setNomin(address3, { from: owner });
		assert.eventEqual(txn, 'NominUpdated', { newNominContract: address3 });

		assert.equal(await issuanceController.nomin(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		const currentNomin = await issuanceController.nomin();

		await assert.revert(issuanceController.setNomin(address4, { from: deployerAccount }));

		assert.equal(await issuanceController.nomin(), currentNomin);
	});

	it('should set havven when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		const txn = await issuanceController.setHavven(address4, { from: owner });
		assert.eventEqual(txn, 'HavvenUpdated', { newHavvenContract: address4 });

		assert.equal(await issuanceController.havven(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		const currentHavven = await issuanceController.havven();

		await assert.revert(issuanceController.setHavven(owner, { from: deployerAccount }));

		assert.equal(await issuanceController.havven(), currentHavven);
	});

	it('should not set price stale period when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 60; // One minute

		await assert.revert(
			issuanceController.setPriceStalePeriod(stalePeriod, { from: deployerAccount })
		);

		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), 3 * 60 * 60);
	});

	it('should set price stale period when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 5 * 60 * 60; // Five hours

		let txn = await issuanceController.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.eventEqual(txn, 'PriceStalePeriodUpdated', { priceStalePeriod: stalePeriod });

		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async function() {
		// The additional 1 is to ensure we are far enough away from the initial deploy that the
		// contract will let us update the price
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 1;
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		let txn = await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		assert.eventEqual(txn, 'PricesUpdated', {
			newEthPrice: usdEth,
			newHavvenPrice: usdHav,
			timeSent: now,
		});

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(ethUSDFromContract.toString(), usdEth);
		assert.equal(lastPriceUpdateTimeFromContract.toString(), now.toString());
	});

	it('should not update prices if time sent is lesser than last updated price time', async function() {
		// Send a price update through, just like the above test so we know our values.
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 2;
		let usdEth = '100';
		let usdHav = '200';

		await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		// Unsuccessful price update attempt
		await assert.revert(
			issuanceController.updatePrices('300', '400', now - 1, {
				from: oracle,
			})
		);

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const EthUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(EthUSDFromContract.toString(), usdEth);
		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(lastPriceUpdateTimeFromContract.toNumber(), now);
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const issuanceController = await IssuanceController.deployed();
		const lastPriceUpdateTime = await issuanceController.lastPriceUpdateTime();
		const oracleFutureLimit = 10 * 60; // 10 minutes. This is hard coded as a const in the contract
		const havUSD = await issuanceController.usdToHavPrice();
		const ethUSD = await issuanceController.usdToEthPrice();

		// Unsuccessful price update attempt
		await assert.revert(
			issuanceController.updatePrices(ethUSD, havUSD, lastPriceUpdateTime + oracleFutureLimit, {
				from: oracle,
			})
		);

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.isTrue(havUSDFromContract.eq(havUSD));
		assert.isTrue(ethUSDFromContract.eq(ethUSD));
		assert.isTrue(lastPriceUpdateTimeFromContract.eq(lastPriceUpdateTime));
	});

	it('should not update prices when not invoked by oracle', async function() {
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 1;
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		await assert.revert(
			issuanceController.updatePrices(usdEth, usdHav, now, {
				from: address1,
			})
		);
	});
});
