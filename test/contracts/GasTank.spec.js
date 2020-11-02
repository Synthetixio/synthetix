const { contract, web3, artifacts } = require('@nomiclabs/buidler');
const { toBN, toWei } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupAllContracts } = require('./setup');
const { toBytes32 } = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const { toUnit, currentTime, divideDecimalRound } = require('../utils')();

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

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: gasTank.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: [
					'approveContract',
					'depositEtherOnBehalf',
					'depositEther',
					'withdrawEtherOnBehalf',
					'withdrawEther',
					'setMaxGasPriceOnBehalf',
					'setMaxGasPrice',
					'payGas',
				],
			});
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

		it('approveContract cannot be invoked except by contract owner.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: gasTank.approveContract,
				args: [toBytes32('Keeper'), true],
				accounts,
				address: owner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});

	describe('deposits', () => {
		it('should return 0 when address has not made any deposit', async () => {
			assert.equal(await gasTank.balanceOf(accountOne), 0);
		});

		describe('depositEther', () => {
			it('should show the amount in the account deposit', async () => {
				const depositAmount = toUnit('10');
				await gasTank.depositEther({ value: depositAmount, from: accountOne });
				assert.bnEqual(await gasTank.balanceOf(accountOne), toBN(depositAmount));
			});

			it('should revert if the amount equals 0', async () => {
				await assert.revert(
					gasTank.depositEther({ value: 0, from: accountOne }),
					'Deposit must be greater than 0'
				);
			});
		});

		describe('withdrawEther', () => {
			const depositAmount = toUnit('10');
			beforeEach(async () => {
				await gasTank.depositEther({ value: depositAmount, from: accountOne });
			});
			it('should allow the account to withdraw their whole deposit', async () => {
				// Balance should be equal to depositAmount
				assert.bnEqual(await gasTank.balanceOf(accountOne), toBN(depositAmount));

				await gasTank.withdrawEther(depositAmount, { from: accountOne });
				assert.equal(await gasTank.balanceOf(accountOne), 0);
			});

			it('should allow the account to withdraw a part of their deposit', async () => {
				const withdrawAmount = toUnit('6');
				// Balance should be equal to depositAmount
				assert.bnEqual(await gasTank.balanceOf(accountOne), toBN(depositAmount));

				await gasTank.withdrawEther(withdrawAmount, { from: accountOne });
				assert.bnEqual(
					await gasTank.balanceOf(accountOne),
					toBN(depositAmount).sub(toBN(withdrawAmount))
				);
			});

			it('should revert if the account tries to withdraw more than current balance', async () => {
				const withdrawAmount = toUnit('11');
				await assert.revert(
					gasTank.withdrawEther(withdrawAmount, { from: accountOne }),
					'revert SafeMath'
				);
			});
		});
	});

	describe('maxGasPrice', () => {
		describe('maxGasPriceOf', () => {
			it('should return 0 when account has not set any max gas price', async () => {
				assert.equal(await gasTank.maxGasPriceOf(accountOne), 0);
			});
		});
		describe('setMaxGasPrice', () => {
			it('should set the max gas price for the sender', async () => {
				const maxGasPrice = toUnit('100');
				await gasTank.setMaxGasPrice(maxGasPrice, { from: accountOne });
				assert.bnEqual(await gasTank.maxGasPriceOf(accountOne), maxGasPrice);
			});
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
			await onlyGivenAddressCanInvoke({
				fnc: keeper.spendGas,
				args: [accountTwo],
				accounts,
				skipPassCheck: true,
				reason: 'Contract is not approved',
			});
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

			const gasUsed = toBN(tx.receipt.gasUsed);
			const gasRefund = gasUsed.mul(toBN(fastGasPriceDefault));
			const keeperFee = divideDecimalRound(keeperFeeDefault, ethPriceDefault);

			assert.bnClose(
				keeperAccountBalance,
				toBN(keeperAccountInitialEthBalance)
					.add(gasRefund)
					.add(keeperFee),
				'10000000000000000'
			);

			const logs = GasTank.decodeLogs(tx.receipt.rawLogs);
			assert.eventEqual(logs[0], 'EtherSpent', {
				spender: accountTwo,
				recipient: keeperAccount,
				gasPrice: fastGasPriceDefault,
			});
		});
	});
});
