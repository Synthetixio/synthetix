const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const PurgeableSynth = artifacts.require('PurgeableSynth');
const TokenState = artifacts.require('TokenState');
const Proxy = artifacts.require('Proxy');

const { currentTime, toUnit, multiplyDecimal, ZERO_ADDRESS } = require('../utils/testUtils');

contract('PurgeableSynth', accounts => {
	const [sUSD, SNX, , sAUD, iETH] = ['sUSD', 'SNX', 'XDR', 'sAUD', 'iETH'].map(
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

	let feePool,
		feePoolProxy,
		// FEE_ADDRESS,
		synthetix,
		synthetixProxy,
		exchangeRates,
		sUSDContract,
		sAUDContract,
		// XDRContract,
		oracle,
		timestamp;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		// Deploy new proxy for feePool
		feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

		synthetix = await Synthetix.deployed();
		// Deploy new proxy for Synthetix
		synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

		// ensure synthetixProxy has target set to synthetix
		await feePool.setProxy(feePoolProxy.address, { from: owner });
		await synthetix.setProxy(synthetixProxy.address, { from: owner });
		// set new proxies on Synthetix and FeePool
		await synthetixProxy.setTarget(synthetix.address, { from: owner });
		await feePoolProxy.setTarget(feePool.address, { from: owner });

		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		// XDRContract = await Synth.at(await synthetix.synths(XDR));

		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();
	});

	const deploySynth = async ({ currencyKey, proxy, tokenState }) => {
		tokenState =
			tokenState ||
			(await TokenState.new(owner, ZERO_ADDRESS, {
				from: deployerAccount,
			}));

		proxy = proxy || (await Proxy.new(owner, { from: deployerAccount }));

		const synth = await PurgeableSynth.new(
			proxy.address,
			tokenState.address,
			synthetixProxy.address,
			feePoolProxy.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			web3.utils.asciiToHex(currencyKey),
			exchangeRates.address,
			web3.utils.toWei('0'),
			{
				from: deployerAccount,
			}
		);
		return { synth, tokenState, proxy };
	};

	const issueSynths = async ({ account, amount }) => {
		await synthetix.methods['transfer(address,uint256)'](account, toUnit(amount), {
			from: owner,
		});
		await synthetix.issueMaxSynths(sUSD, { from: account });
	};

	describe('when a Purgeable synth is added and connected to Synthetix', () => {
		beforeEach(async () => {
			const { synth, tokenState, proxy } = await deploySynth({
				currencyKey: 'iETH',
			});
			await tokenState.setAssociatedContract(synth.address, { from: owner });
			await proxy.setTarget(synth.address, { from: owner });
			await synthetix.addSynth(synth.address, { from: owner });
			this.synth = synth;
		});
		it('it sets exchangerates correctly', async () => {
			const exRates = await this.synth.exchangeRates();
			assert.equal(exRates, exchangeRates.address);
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

		describe("when there's a price for the purgeable synth", () => {
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

			describe('and there exists a user with max sUSD (~133k via synthetixState.issuanceRatio) issued against 1M SNX (at $1)', () => {
				// let userInitialsUSDBalance;
				beforeEach(async () => {
					// give the user 1M SNX from which they'll issue as much as possible
					await issueSynths({ account: account1, amount: 1e6 });
					// userInitialsUSDBalance = await sUSDContract.balanceOf(account1);
				});
				describe('when the user exchanges 100,000 of their sUSD into the purgeable synth', () => {
					let amountToExchange;
					let usersEffectiveBalanceInUSD;
					let balanceBeforePurge;
					let exchangeFeeRate;
					beforeEach(async () => {
						exchangeFeeRate = await feePool.exchangeFeeRate();
						amountToExchange = toUnit(1e5);
						await synthetix.exchange(sUSD, amountToExchange, iETH, {
							from: account1,
						});

						const usersUSDBalance = await sUSDContract.balanceOf(account1);
						const amountExchangedInUSDLessFees = usersUSDBalance.sub(
							multiplyDecimal(usersUSDBalance, exchangeFeeRate)
						);
						balanceBeforePurge = await this.synth.balanceOf(account1);
						usersEffectiveBalanceInUSD = usersUSDBalance.add(amountExchangedInUSDLessFees);
					});
					it('then the exchange occurs with exchange fee deducted', async () => {
						const iETHBalance = await this.synth.balanceOf(account1);
						const effectiveValue = await synthetix.effectiveValue(sUSD, amountToExchange, iETH);
						const effectiveValueMinusFees = effectiveValue.sub(
							multiplyDecimal(effectiveValue, exchangeFeeRate)
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
						let txn;
						beforeEach(async () => {
							txn = await this.synth.purge([account1], { from: owner });
						});
						it('then the user is at 0 balance', async () => {
							const userBalance = await this.synth.balanceOf(account1);
							assert.bnEqual(
								userBalance,
								toUnit(0),
								'The user must no longer have a balance after the purge'
							);
						});
						it('and they have the value added back to sUSD (with fees taken out)', async () => {
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

						it('must issue the Purged event', () => {
							const purgedEvent = txn.logs.find(log => log.event === 'Purged');

							assert.eventEqual(purgedEvent, 'Purged', {
								account: account1,
								value: balanceBeforePurge,
							});
						});
					});

					describe('when purge is invoked with no accounts', () => {
						let txn;
						let totalSupplyBeforePurge;
						beforeEach(async () => {
							totalSupplyBeforePurge = await this.synth.totalSupply();
							txn = await this.synth.purge([], { from: owner });
						});
						it('then no change occurs', async () => {
							const userBalance = await this.synth.balanceOf(account1);
							assert.bnEqual(
								userBalance,
								balanceBeforePurge,
								'The user must not be impacted by an empty purge'
							);
						});
						it('and the totalSupply must be unchanged', async () => {
							const iETHTotalSupply = await this.synth.totalSupply();
							assert.bnEqual(
								iETHTotalSupply,
								totalSupplyBeforePurge,
								'Total supply must be unchanged'
							);
						});
						it('and no events are emitted', async () => {
							assert.equal(txn.logs.length, 0, 'No purged event must be emitted');
						});
					});

					describe('and there exists another user with max synths (~13k) against 100k SNX (at $1)', () => {
						let balanceBeforePurgeUser2;
						beforeEach(async () => {
							await issueSynths({ account: account2, amount: 1e5 });
						});
						describe('when the user exchanges 5000 of their sUSD into the purgeable synth', () => {
							beforeEach(async () => {
								// Note: 5000 is chosen to be large enough to accommodate exchange fees which
								// ultimately limit the total supply of that synth
								await synthetix.exchange(sUSD, toUnit(5000), iETH, {
									from: account2,
								});
								balanceBeforePurgeUser2 = await this.synth.balanceOf(account2);
							});
							describe('when purge is invoked with both accounts', () => {
								it('then it reverts as the totalSupply exceeds the 100,000USD max', async () => {
									await assert.revert(this.synth.purge([account1, account2], { from: owner }));
								});
							});
							describe('when purge is invoked with just one account', () => {
								it('then it reverts as the totalSupply exceeds the 100,000USD max', async () => {
									await assert.revert(this.synth.purge([account2], { from: owner }));
								});
							});
							describe('when the exchange rates has the synth as frozen', () => {
								beforeEach(async () => {
									await exchangeRates.setInversePricing(
										iETH,
										toUnit(100),
										toUnit(150),
										toUnit(50),
										{ from: owner }
									);
									await exchangeRates.updateRates([iETH], ['160'].map(toUnit), timestamp, {
										from: oracle,
									});
								});
								describe('when purge is invoked with just one account', () => {
									let txn;

									beforeEach(async () => {
										txn = await this.synth.purge([account2], { from: owner });
									});

									it('then it must issue the Purged event', () => {
										const purgedEvent = txn.logs.find(log => log.event === 'Purged');

										assert.eventEqual(purgedEvent, 'Purged', {
											account: account2,
											value: balanceBeforePurgeUser2,
										});
									});

									it('and the second user is at 0 balance', async () => {
										const userBalance = await this.synth.balanceOf(account2);
										assert.bnEqual(
											userBalance,
											toUnit(0),
											'The second user must no longer have a balance after the purge'
										);
									});

									it('and no change occurs for the other user', async () => {
										const userBalance = await this.synth.balanceOf(account1);
										assert.bnEqual(
											userBalance,
											balanceBeforePurge,
											'The first user must not be impacted by a purge for another user'
										);
									});
								});

								describe('when purge is invoked with both accounts', () => {
									let txn;
									beforeEach(async () => {
										txn = await this.synth.purge([account2, account1], { from: owner });
									});
									it('then it must issue two purged events', () => {
										const events = txn.logs.filter(log => log.event === 'Purged');

										assert.eventEqual(events[0], 'Purged', {
											account: account2,
											value: balanceBeforePurgeUser2,
										});
										assert.eventEqual(events[1], 'Purged', {
											account: account1,
											value: balanceBeforePurge,
										});
									});
									it('and the total supply of the synth must be 0', async () => {
										const totalSupply = await this.synth.totalSupply();
										assert.bnEqual(
											totalSupply,
											toUnit('0'),
											'Total supply must be 0 after full purge'
										);
									});
								});
							});
						});
					});
				});
			});
		});
	});

	describe('Replacing an existing Synth with a Purgeable one to purge and remove it', () => {
		describe('when sAUD has a price', () => {
			beforeEach(async () => {
				await exchangeRates.updateRates([sAUD], ['0.776845993'].map(toUnit), timestamp, {
					from: oracle,
				});
			});
			describe('when a user holds some sAUD', () => {
				let userBalanceOfOldSynth;
				let usersEffectiveBalanceInUSD;
				beforeEach(async () => {
					await issueSynths({ account: account1, amount: 1e5 });
					const amountToExchange = toUnit('100');
					await synthetix.exchange(sUSD, amountToExchange, sAUD, {
						from: account1,
					});
					const amountExchangedInUSDLessFees = await feePool.amountReceivedFromExchange(
						amountToExchange
					);
					const usersUSDBalance = await sUSDContract.balanceOf(account1);
					usersEffectiveBalanceInUSD = usersUSDBalance.add(amountExchangedInUSDLessFees);
					this.oldSynth = sAUDContract;
					userBalanceOfOldSynth = await this.oldSynth.balanceOf(account1);
					assert.equal(
						userBalanceOfOldSynth.gt(toUnit('0')),
						true,
						'The sAUD balance is greater than zero after exchange'
					);
				});

				describe('when the sAUD synth has its totalSupply set to 0 by the owner', () => {
					beforeEach(async () => {
						this.totalSupply = await this.oldSynth.totalSupply();
						this.oldTokenState = await TokenState.at(await this.oldSynth.tokenState());
						this.oldProxy = await Proxy.at(await this.oldSynth.proxy());
						this.oldSynth.setTotalSupply(toUnit('0'), { from: owner });
					});
					describe('and the old sAUD synth is removed from Synthetix', () => {
						beforeEach(async () => {
							await synthetix.removeSynth(sAUD, { from: owner });
						});
						describe('when a Purgeable synth is added to replace the existing sAUD', () => {
							beforeEach(async () => {
								const { synth } = await deploySynth({
									currencyKey: 'sAUD',
									proxy: this.oldProxy,
									tokenState: this.oldTokenState,
								});
								this.replacement = synth;
							});
							describe('and it is added to Synthetix', () => {
								beforeEach(async () => {
									await synthetix.addSynth(this.replacement.address, { from: owner });
								});

								describe('and the old sAUD TokenState and Proxy is connected to the replacement synth', () => {
									beforeEach(async () => {
										await this.oldTokenState.setAssociatedContract(this.replacement.address, {
											from: owner,
										});
										await this.oldProxy.setTarget(this.replacement.address, { from: owner });
										// now reconnect total supply
										await this.replacement.setTotalSupply(this.totalSupply, { from: owner });
									});
									it('then the user balance has transferred', async () => {
										const balance = await this.replacement.balanceOf(account1);
										assert.bnEqual(
											balance,
											userBalanceOfOldSynth,
											'The balance after connecting TokenState must not have changed'
										);
									});
									describe('when owner attemps to remove new synth from the system', () => {
										it('then it reverts', async () => {
											await assert.revert(synthetix.removeSynth(sAUD, { from: owner }));
										});
									});
									describe('and purge is called on the replacement sAUD contract', () => {
										let txn;
										beforeEach(async () => {
											txn = await this.replacement.purge([account1], { from: owner });
										});
										it('then the user now has a 0 balance in the replacement', async () => {
											const balance = await this.replacement.balanceOf(account1);
											assert.bnEqual(balance, toUnit('0'), 'The balance after purge must be 0');
										});
										it('and their balance must have gone back into sUSD', async () => {
											const balance = await sUSDContract.balanceOf(account1);
											assert.bnEqual(
												balance,
												usersEffectiveBalanceInUSD,
												'The sUSD balance after purge must return to the initial amount, less fees'
											);
										});
										it('and the purge event is issued', async () => {
											const purgedEvent = txn.logs.find(log => log.event === 'Purged');

											assert.eventEqual(purgedEvent, 'Purged', {
												account: account1,
												value: userBalanceOfOldSynth,
											});
										});
										describe('when the purged synth is removed from the system', () => {
											beforeEach(async () => {
												await synthetix.removeSynth(sAUD, { from: owner });
											});
											it('then the balance remains in USD (and no errors occur)', async () => {
												const balance = await sUSDContract.balanceOf(account1);
												assert.bnEqual(
													balance,
													usersEffectiveBalanceInUSD,
													'The sUSD balance after purge must return to the initial amount, less fees'
												);
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
