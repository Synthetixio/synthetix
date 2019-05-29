const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const PurgeableSynth = artifacts.require('PurgeableSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');

const { currentTime, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('PurgeableSynth', accounts => {
	const [sUSD, SNX, , sAUD, iETH] = ['sUSD', 'SNX', 'XDR', 'sAUD', 'iETH'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		,
		account1,
		// account2,
	] = accounts;

	let feePool,
		// FEE_ADDRESS,
		synthetix,
		exchangeRates,
		sUSDContract,
		// sAUDContract,
		// XDRContract,
		oracle,
		timestamp;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		// FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		// sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		// XDRContract = await Synth.at(await synthetix.synths(XDR));

		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		// mimic mainnet - transfer fees are 0
		await feePool.setTransferFeeRate('0', { from: owner });
	});

	const deploySynth = async ({ currencyKey, maxSupplyToPurge }) => {
		const synthTokenState = await TokenState.new(owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		const synthProxy = await Proxy.new(owner, { from: deployerAccount });
		const synth = await PurgeableSynth.new(
			synthProxy.address,
			synthTokenState.address,
			synthetix.address,
			feePool.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			web3.utils.asciiToHex(currencyKey),
			exchangeRates.address,
			maxSupplyToPurge,
			{
				from: deployerAccount,
			}
		);
		await synthTokenState.setAssociatedContract(synth.address, { from: owner });
		await synthProxy.setTarget(synth.address, { from: owner });
		await synthetix.addSynth(synth.address, { from: owner });

		return { synth, synthTokenState, synthProxy };
	};

	const issueSynths = async ({ account, amount }) => {
		await synthetix.methods['transfer(address,uint256)'](account, toUnit(amount), {
			from: owner,
		});
		await synthetix.issueMaxSynths(sUSD, { from: account });
	};

	describe('when a Purgeable synth is added', () => {
		beforeEach(async () => {
			const { synth } = await deploySynth({ currencyKey: 'iETH', maxSupplyToPurge: toUnit(1000) });
			this.synth = synth;
		});
		it('it sets its max supply correctly', async () => {
			const maxSupply = await this.synth.maxSupplyToPurge();
			assert.bnEqual(maxSupply, toUnit(1000));
		});
		it('it sets exchangerates correctly', async () => {
			const exRates = await this.synth.exchangeRates();
			assert.equal(exRates, exchangeRates.address);
		});
		describe('setMaxSupplyToPurge', () => {
			describe('when a non-owner tries to invoke', () => {
				it('then it fails', async () => {
					await assert.revert(
						this.synth.setMaxSupplyToPurge(toUnit(10), { from: deployerAccount })
					);
					await assert.revert(this.synth.setMaxSupplyToPurge(toUnit(100), { from: oracle }));
					await assert.revert(this.synth.setMaxSupplyToPurge(toUnit(99), { from: account1 }));
				});
			});
			describe('when an owner invokes', () => {
				it('then it succeeds', async () => {
					await this.synth.setMaxSupplyToPurge(toUnit(99), { from: owner });
					const newMaxSupply = await this.synth.maxSupplyToPurge();
					assert.bnEqual(newMaxSupply, toUnit(99));
				});
			});
		});
		describe('setExchangeRates', () => {
			let newExRates;
			beforeEach(async () => {
				newExRates = await ExchangeRates.new(
					owner,
					oracle,
					[web3.utils.asciiToHex('SNX')],
					[web3.utils.toWei('0.2', 'ether')],
					{ from: deployerAccount }
				);
			});
			describe('when a non-owner tries to invoke', () => {
				it('then it fails', async () => {
					await assert.revert(
						this.synth.setExchangeRates(newExRates.address, { from: deployerAccount })
					);
					await assert.revert(this.synth.setExchangeRates(newExRates.address, { from: oracle }));
					await assert.revert(this.synth.setExchangeRates(newExRates.address, { from: account1 }));
				});
			});
			describe('when an owner invokes', () => {
				it('then it succeeds', async () => {
					await this.synth.setExchangeRates(newExRates.address, { from: owner });
					const newExRatesAddress = await this.synth.exchangeRates();
					assert.equal(newExRatesAddress, newExRates.address);
				});
			});
		});

		describe('when theres a price for the purgeable synth', () => {
			beforeEach(async () => {
				await exchangeRates.updateRates(
					[sAUD, SNX, iETH],
					['0.5', '1', '0.1'].map(toUnit),
					timestamp,
					{
						from: oracle,
					}
				);
			});

			it('then getMaxSupplyToPurgeInCurrency returns the value at the current exchange rate', async () => {
				const maxSupplyToPurgeInCurrency = await this.synth.getMaxSupplyToPurgeInCurrency();

				assert.bnEqual(
					maxSupplyToPurgeInCurrency,
					toUnit(1000 / 0.1),
					'Max supply in purge currency must be converted via current exchange rate'
				);
			});
			describe('when the price for the purgeable synth changes', () => {
				beforeEach(async () => {
					await exchangeRates.updateRates([iETH], ['0.25'].map(toUnit), timestamp, {
						from: oracle,
					});
				});

				it('then getMaxSupplyToPurgeInCurrency returns the value at the new exchange rate', async () => {
					const maxSupplyToPurgeInCurrency = await this.synth.getMaxSupplyToPurgeInCurrency();

					assert.bnEqual(
						maxSupplyToPurgeInCurrency,
						toUnit(1000 / 0.25),
						'Max supply in purge currency must be converted via current exchange rate'
					);
				});
			});

			describe('and there exists a user with 2000 sUSD', () => {
				// let userInitialsUSDBalance;
				beforeEach(async () => {
					// give the user 10,000 SNX from which they'll issue as much as possible
					await issueSynths({ account: account1, amount: 10000 });
					// userInitialsUSDBalance = await sUSDContract.balanceOf(account1);
				});
				describe('when the user exchanges 1000 of their sUSD into the purgeable synth', () => {
					let amountToExchange;
					let usersEffectiveBalanceInUSD;
					beforeEach(async () => {
						amountToExchange = toUnit(1000);
						await synthetix.exchange(sUSD, amountToExchange, iETH, ZERO_ADDRESS, {
							from: account1,
						});

						const usersUSDBalance = await sUSDContract.balanceOf(account1);
						const amountExchangedInUSDLessFees = await feePool.amountReceivedFromExchange(
							amountToExchange
						);
						usersEffectiveBalanceInUSD = usersUSDBalance.add(amountExchangedInUSDLessFees);
					});
					it('then the exchange works as expected', async () => {
						const iETHBalance = await this.synth.balanceOf(account1);
						const effectiveValue = await synthetix.effectiveValue(sUSD, amountToExchange, iETH);
						const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(
							effectiveValue
						);
						assert.bnEqual(
							iETHBalance,
							effectiveValueMinusFees,
							'Must receive correct amount from exchange'
						);
						const iETHTotalSupply = await this.synth.totalSupply();

						assert.bnEqual(
							iETHTotalSupply,
							effectiveValueMinusFees,
							'Total supply must match the single user balance'
						);
					});
					describe('when purge is called for the synth', () => {
						beforeEach(async () => {
							await this.synth.purge([account1], { from: owner });
						});
						it('then the user is at 0 balance', async () => {
							const userBalance = await this.synth.balanceOf(account1);
							assert.bnEqual(
								userBalance,
								toUnit(0),
								'The user must no longer have a balance after the purge'
							);
						});
						it('and they have the value added back to sUSD (with no fees taken out)', async () => {
							const userBalance = await sUSDContract.balanceOf(account1);
							assert.bnEqual(
								userBalance,
								usersEffectiveBalanceInUSD,
								'User must be credited back in sUSD from the purge'
							);
						});
						it('then the synth has totalSupply back at 0', async () => {
							const iETHTotalSupply = await this.synth.totalSupply();
							assert.bnEqual(iETHTotalSupply, toUnit(0), 'Total supply must be 0 after the purge');
						});

						it('must issue the correct events');
					});
				});
			});
		});

		describe('when the purgeable synth is frozen', () => {});
	});

	describe('when a regular synth is frozen', () => {});
});
