const IssuanceController = artifacts.require('IssuanceController');

contract('Issuance controller', async function(accounts) {
	const deployerAccount = accounts[0];

	const owner = accounts[1];
	const fundsWallet = accounts[2];
	const havven = accounts[3];
	const nomin = accounts[4];
	const oracle = accounts[5];

	const address1 = accounts[6];
	const address2 = accounts[7];
	const address3 = accounts[8];
	const address4 = accounts[9];

	let instance;

	it('should set constructor params on deployment', async function() {
		let usdEth = 274957049546843687330;
		let usdHav = 127474638738934625;

		instance = await IssuanceController.new(
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

		let havvenFromContrct = await instance.havven.call();
		assert.equal(havvenFromContrct, havven);

		let nominFromContrct = await instance.nomin.call();
		assert.equal(nominFromContrct, nomin);

		let fundsWalletFrmCnt = await instance.fundsWallet.call();
		assert.equal(fundsWalletFrmCnt, fundsWallet);

		let oracleFrmCnt = await instance.oracle.call();
		assert.equal(oracleFrmCnt, oracle);

		let usdToHavFrmCnt = await instance.usdToHavPrice.call();
		assert.equal(usdToHavFrmCnt.toNumber(), usdHav);

		let usdToEthPriceFrmCnt = await instance.usdToEthPrice.call();
		assert.equal(usdToEthPriceFrmCnt.toNumber(), usdEth);
	});

	it('should set funds wallet when invoked by owner', async function() {
		let txn = await instance.setFundsWallet(address1, { from: owner });
		assert.equal(txn.logs[0].event, 'FundsWalletUpdated');
		assert.equal(txn.logs[0].args.newFundsWallet, address1);

		assert.equal(await instance.fundsWallet.call(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		try {
			await instance.setFundsWallet(address2, { from: deployerAccount });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.fundsWallet.call(), address1);
	});

	it('should set oracle when invoked by owner', async function() {
		let txn = await instance.setOracle(address2, { from: owner });
		assert.equal(txn.logs[0].event, 'OracleUpdated');
		assert.equal(txn.logs[0].args.newOracle, address2);

		assert.equal(await instance.oracle.call(), address2);
	});

	it('should not set oracle when not invoked by owner', async function() {
		try {
			await instance.setOracle(address3, { from: deployerAccount });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.oracle.call(), address2);
	});

	it('should set nomin when invoked by owner', async function() {
		let txn = await instance.setNomin(address3, { from: owner });
		assert.equal(txn.logs[0].event, 'NominUpdated');
		assert.equal(txn.logs[0].args.newNominContract, address3);

		assert.equal(await instance.nomin.call(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		try {
			await instance.setNomin(address4, { from: deployerAccount });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.nomin.call(), address3);
	});

	it('should set havven when invoked by owner', async function() {
		let txn = await instance.setHavven(address4, { from: owner });
		assert.equal(txn.logs[0].event, 'HavvenUpdated');
		assert.equal(txn.logs[0].args.newHavvenContract, address4);

		assert.equal(await instance.havven.call(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		try {
			await instance.setHavven(owner, { from: deployerAccount });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.havven.call(), address4);
	});

	it('should not set price stale period when not invoked by owner', async function() {
		let currentTimeInMillis = new Date().getTime() + 60 * 60 * 1000;
		try {
			await instance.setPriceStalePeriod(currentTimeInMillis, {
				from: deployerAccount,
			});
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		const priceStalePeriod = await instance.priceStalePeriod.call();
		assert.equal(priceStalePeriod.toNumber(), 3 * 60 * 60);
	});

	it('should set price stale period when invoked by owner', async function() {
		let currentTimeInMillis = new Date().getTime() + 60 * 60 * 1000;
		let txn = await instance.setPriceStalePeriod(currentTimeInMillis, {
			from: owner,
		});
		assert.equal(txn.logs[0].event, 'PriceStalePeriodUpdated');
		assert.equal(txn.logs[0].args.priceStalePeriod, currentTimeInMillis);

		const priceStalePeriod = await instance.priceStalePeriod.call();
		assert.equal(priceStalePeriod.toNumber(), currentTimeInMillis);
	});

	it('should update prices when invoked by oracle', async function() {
		let timeInMillis = new Date().getTime() + 9 * 60 * 1000;
		let time = Math.trunc(timeInMillis / 1000); // in seconds
		let usdEth = 994957049546843687330;
		let usdHav = 157474638738934625;

		let txn = await instance.updatePrices(usdEth, usdHav, time, {
			from: address2,
		});
		let log = txn.logs[0];
		assert.equal(log.event, 'PricesUpdated');
		assert.equal(log.args.newEthPrice, usdEth);
		assert.equal(log.args.newHavvenPrice, usdHav);
		assert.equal(log.args.timeSent, time);

		const havUSDFrmCtrct = await instance.usdToHavPrice.call();
		const ethUSDFrmCtrct = await instance.usdToEthPrice.call();
		const lastPriceUpdateTimeFrnCtrct = await instance.lastPriceUpdateTime.call();

		assert.equal(havUSDFrmCtrct.toNumber(), usdHav);
		assert.equal(ethUSDFrmCtrct.toNumber(), usdEth);
		assert.equal(lastPriceUpdateTimeFrnCtrct.toNumber(), time);
	});

	it('should not update prices if time sent is lesser than last updated price time', async function() {
		const lastPriceUpdateTime = await instance.lastPriceUpdateTime.call();
		const havUSD = await instance.usdToHavPrice.call();
		const ethUSD = await instance.usdToEthPrice.call();

		let timeInMillis = lastPriceUpdateTime * 1000 - 12 * 60 * 60 * 1000;
		let time = Math.trunc(timeInMillis / 1000); // in seconds
		let usdEth = 994957049546843687330;
		let usdHav = 157474638738934625;

		// Unsuccessful price update attempt
		try {
			await instance.updatePrices(usdEth, usdHav, time, { from: address2 });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}

		const havUSDFrmCtrct = await instance.usdToHavPrice.call();
		const EthUSDFrmCtrct = await instance.usdToEthPrice.call();
		const lastPriceUpdateTimeFrmCtrct = await instance.lastPriceUpdateTime.call();

		assert.equal(havUSDFrmCtrct.toNumber(), havUSD.toNumber());
		assert.equal(EthUSDFrmCtrct.toNumber(), ethUSD.toNumber());
		assert.equal(lastPriceUpdateTimeFrmCtrct.toNumber(), lastPriceUpdateTime.toNumber());
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const lastPriceUpdateTime = await instance.lastPriceUpdateTime.call();
		const havUSD = await instance.usdToHavPrice.call();
		const ethUSD = await instance.usdToEthPrice.call();

		let timeInMillis = new Date().getTime() + 12 * 60 * 1000;
		let time = Math.trunc(timeInMillis / 1000); // in seconds

		let usdEth = 994957049546843687330;
		let usdHav = 157474638738934625;

		// Unsuccessful price update attempt
		try {
			await instance.updatePrices(usdEth, usdHav, time, { from: address2 });
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}

		const havUSDFrmCtrct = await instance.usdToHavPrice.call();
		const EthUSDFrmCtrct = await instance.usdToEthPrice.call();
		const lastPriceUpdateTimeFrmCtrct = await instance.lastPriceUpdateTime.call();

		assert.equal(havUSDFrmCtrct.toNumber(), havUSD.toNumber());
		assert.equal(EthUSDFrmCtrct.toNumber(), ethUSD.toNumber());
		assert.equal(lastPriceUpdateTimeFrmCtrct.toNumber(), lastPriceUpdateTime.toNumber());
	});

	it('should not update prices when not invoked by oracle', async function() {
		let currentTimeInMillis = new Date().getTime();
		let usdEth = 774957049546843687330;
		let usdHav = 227474638738934625;
		try {
			await instance.updatePrices(usdEth, usdHav, currentTimeInMillis, {
				from: address2,
			});
		} catch (error) {
			console.log(`Transaction error :: ${error}`);
			assert.include(error.message, 'revert');
		}
		assert.equal(await instance.fundsWallet.call(), address1);
	});
});
