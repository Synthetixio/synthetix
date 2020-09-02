const { contract, web3, artifacts } = require('@nomiclabs/buidler');
const { toBN, toWei } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupAllContracts } = require('./setup');
const { toBytes32 } = require('../..');
const { toUnit, currentTime } = require('../utils')();

const Keeper = artifacts.require('Keeper');
const GasTank = artifacts.require('GasTank');

contract('GasTank', accounts => {
	const [deployer, owner, oracle, accountOne, accountTwo, accountThree] = accounts;

	let gasTank, addressResolver, keeper, exchangeRates, systemSettings, delegateApprovals;

	const [fastGasPrice, ETH] = ['fastGasPrice', 'ETH'].map(toBytes32);
	const fastGasPriceDefault = toWei('80', 'gwei');
	const ethPriceDefault = toUnit('500');
	const keeperFeeDefault = toUnit('2');

	before(async () => {
		({
			GasTank: gasTank,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemSettings: systemSettings,
			DelegateApprovals: delegateApprovals,
		} = await setupAllContracts({
			accounts,
			contracts: ['GasTank', 'ExchangeRates', 'SystemStatus', 'ExchangeRates'],
		}));
		keeper = await Keeper.new(owner, addressResolver.address, { from: deployer });
		await addressResolver.importAddresses(['Keeper'].map(toBytes32), [keeper.address], {
			from: owner,
		});
		await systemSettings.setKeeperFee(keeperFeeDefault, { from: owner });
		await gasTank.setResolverAndSyncCache(addressResolver.address, { from: owner });
		await keeper.setResolverAndSyncCache(addressResolver.address, { from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		const timestamp = await currentTime();
		await exchangeRates.updateRates(
			[fastGasPrice, ETH],
			[fastGasPriceDefault, ethPriceDefault],
			timestamp,
			{
				from: oracle,
			}
		);
	});

	describe('Basic parameters', () => {
		it('Parameters are set properly', async () => {
			assert.equal(await gasTank.owner(), owner);
			assert.equal(await gasTank.resolver(), addressResolver.address);
			assert.bnEqual(await systemSettings.keeperFee(), keeperFeeDefault);
		});
	});
	describe('currentGasPrice', () => {
		it('should return the current gas price from the ExchangeRates', async () => {
			assert.bnEqual(await gasTank.currentGasPrice(), fastGasPriceDefault);
		});
	});

	describe('currentEtherPrice', () => {
		it('should return the current ether price from the ExchangeRates', async () => {
			assert.bnEqual(await gasTank.currentEtherPrice(), ethPriceDefault);
		});
	});

	describe('executionCost', () => {
		it('should return the execution cost when a gas amount is provided', async () => {
			const gasAmount = '100000';
			const payGasCost = await gasTank.PAYGAS_COST();

			const transactionPrice =
				(Number(gasAmount) + Number(payGasCost)) * Number(fastGasPriceDefault);
			const keeperFee = toUnit(Number(keeperFeeDefault) / Number(ethPriceDefault));

			assert.bnEqual(
				await gasTank.executionCost(gasAmount),
				toBN(transactionPrice).add(toBN(keeperFee))
			);
		});
	});

	describe('approveContract', () => {
		it('should return false when a contract has not been approved yet', async () => {
			assert.isFalse(await gasTank.approved(keeper.address));
		});
		it('should return true after a contract has been approved', async () => {
			await gasTank.approveContract(toBytes32('Keeper'), true, { from: owner });
			assert.isTrue(await gasTank.approved(keeper.address));
		});
	});

	describe('Transactions on behalf', () => {
		describe('depositEtherOnBehalf', () => {
			const depositAmount = toUnit('10');
			it('should revert if account has not been approved to act on behalf', async () => {
				await assert.revert(
					gasTank.depositEtherOnBehalf(accountTwo, { value: depositAmount, from: accountOne }),
					'Not approved to act on behalf'
				);
			});
			it('should deposit ether on behalf for another account', async () => {
				// Account should not have deposits yet
				assert.bnEqual(await gasTank.balanceOf(accountTwo), toBN(0));
				await delegateApprovals.approveManageGasTankOnBehalf(accountOne, { from: accountTwo });
				await gasTank.depositEtherOnBehalf(accountTwo, { value: depositAmount, from: accountOne });
				assert.bnEqual(await gasTank.balanceOf(accountTwo), toBN(depositAmount));
			});
		});
		describe('withdrawEtherOnBehalf', () => {
			const depositAmount = toUnit('20');
			beforeEach(async () => {
				await delegateApprovals.approveManageGasTankOnBehalf(accountOne, { from: accountTwo });
				await gasTank.depositEtherOnBehalf(accountTwo, { value: depositAmount, from: accountOne });
			});

			it('should revert if account has not been approved to act on behalf', async () => {
				await assert.revert(
					gasTank.withdrawEtherOnBehalf(accountOne, accountOne, depositAmount, {
						from: accountTwo,
					}),
					'Not approved to act on behalf'
				);
			});
			it('should withdraw the full ether balance on behalf for another account', async () => {
				const accountInitialEthBalance = await web3.eth.getBalance(accountTwo);
				await gasTank.withdrawEtherOnBehalf(accountTwo, accountTwo, depositAmount, {
					from: accountOne,
				});
				assert.bnEqual(
					await web3.eth.getBalance(accountTwo),
					toBN(accountInitialEthBalance).add(toBN(depositAmount))
				);
			});
			it('should withdraw the full ether balance on behalf for another account', async () => {
				const accountInitialEthBalance = await web3.eth.getBalance(accountTwo);
				await gasTank.withdrawEtherOnBehalf(accountTwo, accountTwo, depositAmount, {
					from: accountOne,
				});
				assert.bnEqual(
					await web3.eth.getBalance(accountTwo),
					toBN(accountInitialEthBalance).add(toBN(depositAmount))
				);
				assert.bnEqual(await gasTank.balanceOf(accountTwo), 0);
			});
			it('should withdraw a partial amount of the ether balance on behalf for another account', async () => {
				const withdrawAmount = toUnit('10');
				const accountInitialEthBalance = await web3.eth.getBalance(accountTwo);
				await gasTank.withdrawEtherOnBehalf(accountTwo, accountTwo, withdrawAmount, {
					from: accountOne,
				});
				assert.bnEqual(
					await web3.eth.getBalance(accountTwo),
					toBN(accountInitialEthBalance).add(toBN(withdrawAmount))
				);
				assert.bnEqual(
					await gasTank.balanceOf(accountTwo),
					toBN(depositAmount).sub(toBN(withdrawAmount))
				);
			});
			it('should withdraw the ether balance on behalf for another account, to a specified receiving account', async () => {
				const accountInitialEthBalance = await web3.eth.getBalance(accountThree);
				await gasTank.withdrawEtherOnBehalf(accountTwo, accountThree, depositAmount, {
					from: accountOne,
				});
				assert.bnEqual(
					await web3.eth.getBalance(accountThree),
					toBN(accountInitialEthBalance).add(toBN(depositAmount))
				);
				assert.bnEqual(await gasTank.balanceOf(accountTwo), 0);
			});
		});
		describe('setMaxGasPriceOnBehalf', () => {
			const maxGasPrice = toWei('100', 'gwei');
			it('should revert if account has not been approved to act on behalf', async () => {
				await assert.revert(
					gasTank.setMaxGasPriceOnBehalf(accountTwo, maxGasPrice, { from: accountOne }),
					'Not approved to act on behalf'
				);
			});
			it('should deposit ether on behalf for another account', async () => {
				await delegateApprovals.approveManageGasTankOnBehalf(accountOne, { from: accountTwo });
				await gasTank.setMaxGasPriceOnBehalf(accountTwo, maxGasPrice, {
					from: accountOne,
				});
				assert.bnEqual(await gasTank.maxGasPriceOf(accountTwo), toBN(maxGasPrice));
			});
		});
	});

	describe('payGas', () => {
		it('should revert if contract has not been approved', async () => {
			await assert.revert(
				keeper.spendGas(accountTwo, {
					from: accountOne,
				}),
				'Contract is not approved'
			);
		});
		it('should revert if gasprice is too low', async () => {
			await gasTank.approveContract(toBytes32('Keeper'), true, { from: owner });
			await assert.revert(
				keeper.spendGas(accountTwo, {
					from: accountOne,
					gasPrice: toWei('79', 'gwei'),
				}),
				'Gas price is too low'
			);
		});
		it('should revert if gasprice > account maxGasPrice', async () => {
			await gasTank.approveContract(toBytes32('Keeper'), true, { from: owner });
			await gasTank.setMaxGasPrice(toWei('85', 'gwei'), { from: accountTwo });
			await assert.revert(
				keeper.spendGas(accountTwo, {
					from: accountOne,
					gasPrice: toWei('86', 'gwei'),
				}),
				'Spender gas price limit is reached'
			);
		});
		it('should revert if account ether is too low', async () => {
			await gasTank.approveContract(toBytes32('Keeper'), true, { from: owner });
			await assert.revert(
				keeper.spendGas(accountTwo, {
					from: accountOne,
					gasPrice: toWei('86', 'gwei'),
				}),
				'SafeMath: subtraction overflow'
			);
		});
		it('should refund the keeper for the entire transaction plus a keeper fee', async () => {
			const depositAmount = toUnit('20');
			const keeperAccount = accountOne;
			const keeperAccountInitialEthBalance = await web3.eth.getBalance(keeperAccount);
			await gasTank.approveContract(toBytes32('Keeper'), true, { from: owner });
			await gasTank.setMaxGasPrice(toWei('85', 'gwei'), { from: accountTwo });
			await gasTank.depositEther({ value: depositAmount, from: accountTwo });

			const tx = await keeper.spendGas(accountTwo, {
				from: keeperAccount,
				gasPrice: fastGasPriceDefault,
			});

			const keeperAccountBalance = await web3.eth.getBalance(keeperAccount);

			// the final balance should be greater than initial balance (tx refund + keeper fee)
			assert.bnGt(toBN(keeperAccountBalance), toBN(keeperAccountInitialEthBalance));
			const logs = GasTank.decodeLogs(tx.receipt.rawLogs);
			assert.eventEqual(logs[0], 'EtherSpent', {
				spender: accountTwo,
				recipient: keeperAccount,
				gasPrice: fastGasPriceDefault,
			});
		});
	});
});
