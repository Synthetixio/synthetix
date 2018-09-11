const IssuanceController = artifacts.require('IssuanceController');

contract('Issuance Controller', async function(accounts) {
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
		let usdEth = '274957049546843687330';
		let usdHav = '127474638738934625';

		const instance = await IssuanceController.new(
			owner,
			fundsWallet,
			havven,
			nomin,
			oracle,
			usdEth,
			usdHav,
			{
				from: deployerAccount,
			}
		);

		const havvenFromContract = await instance.havven();
		assert.equal(havvenFromContract, havven);

		const nominFromContract = await instance.nomin();
		assert.equal(nominFromContract, nomin);

		const fundsWalletFromContract = await instance.fundsWallet();
		assert.equal(fundsWalletFromContract, fundsWallet);

		const oracleFromContract = await instance.oracle();
		assert.equal(oracleFromContract, oracle);

		const usdToHavFromContract = await instance.usdToHavPrice();
		assert.equal(usdToHavFromContract.toString(), usdHav);

		const usdToEthPriceFromContract = await instance.usdToEthPrice();
		assert.equal(usdToEthPriceFromContract.toString(), usdEth);
	});

	it('should set funds wallet when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setFundsWallet(address1, { from: owner });
		assert.equal(txn.logs[0].event, 'FundsWalletUpdated');
		assert.equal(txn.logs[0].args.newFundsWallet, address1);

		assert.equal(await issuanceController.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		try {
			await issuanceController.setFundsWallet(address2, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.fundsWallet(), address1);
	});

	it('should set oracle when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setOracle(address2, { from: owner });
		assert.equal(txn.logs[0].event, 'OracleUpdated');
		assert.equal(txn.logs[0].args.newOracle, address2);

		assert.equal(await issuanceController.oracle(), address2);

		// Now reset the oracle address so the other tests don't depend on this test's behaviour
		await issuanceController.setOracle(oracle, { from: owner });
	});

	it('should not set oracle when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		try {
			await issuanceController.setOracle(address3, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.oracle(), oracle);
	});

	it('should set nomin when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setNomin(address3, { from: owner });
		assert.equal(txn.logs[0].event, 'NominUpdated');
		assert.equal(txn.logs[0].args.newNominContract, address3);

		assert.equal(await issuanceController.nomin(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		try {
			await issuanceController.setNomin(address4, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.nomin(), address3);
	});

	it('should set havven when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		const txn = await issuanceController.setHavven(address4, { from: owner });
		assert.equal(txn.logs[0].event, 'HavvenUpdated');
		assert.equal(txn.logs[0].args.newHavvenContract, address4);

		assert.equal(await issuanceController.havven(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		try {
			await issuanceController.setHavven(owner, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.havven(), address4);
	});

	it('should not set price stale period when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 60; // One minute

		try {
			await issuanceController.setPriceStalePeriod(stalePeriod, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), 3 * 60 * 60);
	});

	it('should set price stale period when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 5 * 60 * 60; // Five hours

		let txn = await issuanceController.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.equal(txn.logs[0].event, 'PriceStalePeriodUpdated');
		assert.equal(txn.logs[0].args.priceStalePeriod, stalePeriod);

		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async function() {
		// The additional 1 is to ensure we are far enough away from the initial deploy that the
		// contract will let us update the price
		let now = Math.floor(Date.now() / 1000) + 1;
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		let log = txn.logs[0];
		assert.equal(log.event, 'PricesUpdated');
		assert.equal(log.args.newEthPrice, usdEth);
		assert.equal(log.args.newHavvenPrice, usdHav);
		assert.equal(log.args.timeSent, now);

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(ethUSDFromContract.toString(), usdEth);
		assert.equal(lastPriceUpdateTimeFromContract.toString(), now.toString());
	});

	it('should not update prices if time sent is lesser than last updated price time', async function() {
		const issuanceController = await IssuanceController.deployed();
		const lastPriceUpdateTime = await issuanceController.lastPriceUpdateTime();
		const havUSD = await issuanceController.usdToHavPrice();
		const ethUSD = await issuanceController.usdToEthPrice();

		// Unsuccessful price update attempt
		try {
			await issuanceController.updatePrices(usdEth, usdHav, lastPriceUpdateTime - 1, {
				from: oracle,
			});
		} catch (error) {
			assert.include(error.message, 'revert');
		}

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const EthUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(havUSDFromContract.toNumber(), havUSD.toNumber());
		assert.equal(EthUSDFromContract.toNumber(), ethUSD.toNumber());
		assert.equal(lastPriceUpdateTimeFromContract.toNumber(), lastPriceUpdateTime.toNumber());
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const issuanceController = await IssuanceController.deployed();
		const lastPriceUpdateTime = await issuanceController.lastPriceUpdateTime();
		const oracleFutureLimit = await issuanceController.ORACLE_FUTURE_LIMIT();
		const havUSD = await issuanceController.usdToHavPrice();
		const ethUSD = await issuanceController.usdToEthPrice();

		// Unsuccessful price update attempt
		try {
			await instance.updatePrices(ethUSD, havUSD, lastPriceUpdateTime + oracleFutureLimit, {
				from: oracle,
			});
		} catch (error) {
			assert.include(error.message, 'revert');
		}

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.isTrue(havUSDFromContract.eq(havUSD));
		assert.isTrue(ethUSDFromContract.eq(ethUSD));
		assert.isTrue(lastPriceUpdateTimeFromContract.eq(lastPriceUpdateTime));
	});

	it('should not update prices when not invoked by oracle', async function() {
		let currentTimeInMillis = new Date().getTime();
		let usdEth = 774957049546843687330;
		let usdHav = 227474638738934625;
		try {
			await instance.updatePrices(usdEth, usdHav, currentTimeInMillis, {
				from: oracle,
			});
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.fundsWallet(), address1);
	});
});
