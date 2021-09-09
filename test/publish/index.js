const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pLimit = require('p-limit');

const ethers = require('ethers');
const isCI = require('is-ci');

const { loadCompiledFiles } = require('../../publish/src/solidity');
const { loadLocalWallets } = require('../test-utils/wallets');
const { fastForward } = require('../test-utils/rpc');

const deployStakingRewardsCmd = require('../../publish/src/commands/deploy-staking-rewards');
const deployShortingRewardsCmd = require('../../publish/src/commands/deploy-shorting-rewards');
const deployCmd = require('../../publish/src/commands/deploy');
const { buildPath } = deployCmd.DEFAULTS;
const testUtils = require('../utils');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: deployCmd.deploy,
	deployStakingRewards: deployStakingRewardsCmd.deployStakingRewards,
	deployShortingRewards: deployShortingRewardsCmd.deployShortingRewards,
	replaceSynths: require('../../publish/src/commands/replace-synths').replaceSynths,
	purgeSynths: require('../../publish/src/commands/purge-synths').purgeSynths,
	removeSynths: require('../../publish/src/commands/remove-synths').removeSynths,
};

const snx = require('../..');
const {
	toBytes32,
	constants: {
		STAKING_REWARDS_FILENAME,
		CONFIG_FILENAME,
		DEPLOYMENT_FILENAME,
		SYNTHS_FILENAME,
		FEEDS_FILENAME,
	},
	defaults: {
		WAITING_PERIOD_SECS,
		PRICE_DEVIATION_THRESHOLD_FACTOR,
		ISSUANCE_RATIO,
		FEE_PERIOD_DURATION,
		TARGET_THRESHOLD,
		LIQUIDATION_DELAY,
		LIQUIDATION_RATIO,
		LIQUIDATION_PENALTY,
		RATE_STALE_PERIOD,
		EXCHANGE_FEE_RATES,
		MINIMUM_STAKE_TIME,
		TRADING_REWARDS_ENABLED,
		DEBT_SNAPSHOT_STALE_TIME,
	},
	wrap,
} = snx;

const concurrency = isCI ? 1 : 10;
const limitPromise = pLimit(concurrency);

describe('publish scripts', () => {
	const network = 'local';

	const {
		getSource,
		getTarget,
		getSynths,
		getPathToNetwork,
		getStakingRewards,
		getShortingRewards,
	} = wrap({
		network,
		fs,
		path,
	});

	const deploymentPath = getPathToNetwork();

	// track these files to revert them later on
	const rewardsJSONPath = path.join(deploymentPath, STAKING_REWARDS_FILENAME);
	const rewardsJSON = fs.readFileSync(rewardsJSONPath);
	const synthsJSONPath = path.join(deploymentPath, SYNTHS_FILENAME);
	const synthsJSON = fs.readFileSync(synthsJSONPath);
	const configJSONPath = path.join(deploymentPath, CONFIG_FILENAME);
	const configJSON = fs.readFileSync(configJSONPath);
	const deploymentJSONPath = path.join(deploymentPath, DEPLOYMENT_FILENAME);
	const feedsJSONPath = path.join(deploymentPath, FEEDS_FILENAME);
	const feedsJSON = fs.readFileSync(feedsJSONPath);

	const logfilePath = path.join(__dirname, 'test.log');
	let gasLimit;
	let gasPrice;
	let accounts;
	let sUSD;
	let sBTC;
	let sETH;
	let provider;
	let overrides;

	const resetConfigAndSynthFiles = () => {
		// restore the synths and config files for this env (cause removal updated it)
		fs.writeFileSync(synthsJSONPath, synthsJSON);
		fs.writeFileSync(rewardsJSONPath, rewardsJSON);
		fs.writeFileSync(configJSONPath, configJSON);
		fs.writeFileSync(feedsJSONPath, feedsJSON);

		// and reset the deployment.json to signify new deploy
		fs.writeFileSync(deploymentJSONPath, JSON.stringify({ targets: {}, sources: {} }));
	};

	const callMethodWithRetry = async method => {
		let response;

		try {
			response = await method;
		} catch (err) {
			console.log('Error detected looking up value. Ignoring and trying again.', err);
			// retry
			response = await method;
		}

		return limitPromise(() => response);
	};

	before(() => {
		fs.writeFileSync(logfilePath, ''); // reset log file
		fs.writeFileSync(deploymentJSONPath, JSON.stringify({ targets: {}, sources: {} }));
	});

	beforeEach(async () => {
		console.log = (...input) => fs.appendFileSync(logfilePath, input.join(' ') + '\n');

		provider = new ethers.providers.JsonRpcProvider({
			url: 'http://localhost:8545',
		});

		const { isCompileRequired } = testUtils();

		// load accounts used by local EVM
		const wallets = loadLocalWallets({ provider });

		accounts = {
			deployer: wallets[0],
			first: wallets[1],
			second: wallets[2],
		};

		if (isCompileRequired()) {
			console.log('Found source file modified after build. Rebuilding...');

			await commands.build({ showContractSize: true, testHelpers: true });
		} else {
			console.log('Skipping build as everything up to date');
		}

		[sUSD, sBTC, sETH] = ['sUSD', 'sBTC', 'sETH'].map(toBytes32);

		gasLimit = 8000000;
		gasPrice = ethers.utils.parseUnits('5', 'gwei');

		overrides = {
			gasLimit,
			gasPrice,
		};
	});

	afterEach(resetConfigAndSynthFiles);

	describe('integrated actions test', () => {
		describe('when deployed', () => {
			let rewards;
			let sources;
			let targets;
			let synths;
			let Synthetix;
			let timestamp;
			let sUSDContract;
			let sBTCContract;
			let sETHContract;
			let FeePool;
			let DebtCache;
			let Exchanger;
			let Issuer;
			let SystemSettings;
			let Liquidations;
			let ExchangeRates;
			const aggregators = {};

			const getContract = ({ target, source }) =>
				new ethers.Contract(
					targets[target].address,
					(sources[source] || sources[targets[target].source]).abi,
					accounts.deployer
				);

			const createMockAggregator = async () => {
				// get last build
				const { compiled } = loadCompiledFiles({ buildPath });
				const {
					abi,
					evm: {
						bytecode: { object: bytecode },
					},
				} = compiled['MockAggregatorV2V3'];
				const MockAggregatorFactory = new ethers.ContractFactory(abi, bytecode, accounts.deployer);
				const MockAggregator = await MockAggregatorFactory.deploy({ gasLimit, gasPrice });

				const tx = await MockAggregator.setDecimals('8', {
					gasLimit,
					gasPrice,
				});
				await tx.wait();

				return MockAggregator;
			};

			const setAggregatorAnswer = async ({ asset, rate }) => {
				let tx;

				tx = await aggregators[asset].setLatestAnswer(
					(rate * 1e8).toString(),
					timestamp,
					overrides
				);
				await tx.wait();

				// Cache the debt to make sure nothing's wrong/stale after the rate update.
				tx = await DebtCache.takeDebtSnapshot(overrides);
			};

			beforeEach(async () => {
				timestamp = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

				// deploy a mock aggregator for all supported rates
				const feeds = JSON.parse(feedsJSON);
				for (const feedEntry of Object.values(feeds)) {
					const aggregator = await createMockAggregator();
					aggregators[feedEntry.asset] = aggregator;
					feedEntry.feed = aggregator.address;
				}
				fs.writeFileSync(feedsJSONPath, JSON.stringify(feeds));

				await commands.deploy({
					concurrency,
					network,
					freshDeploy: true,
					yes: true,
					privateKey: accounts.deployer.privateKey,
					ignoreCustomParameters: true,
				});

				sources = getSource();
				targets = getTarget();
				synths = getSynths().filter(({ name }) => name !== 'sUSD');

				Synthetix = getContract({ target: 'ProxyERC20', source: 'Synthetix' });
				FeePool = getContract({ target: 'ProxyFeePool', source: 'FeePool' });
				Exchanger = getContract({ target: 'Exchanger' });
				DebtCache = getContract({ target: 'DebtCache' });

				Issuer = getContract({ target: 'Issuer' });

				sUSDContract = getContract({ target: 'ProxyERC20sUSD', source: 'Synth' });

				sBTCContract = getContract({ target: 'ProxysBTC', source: 'Synth' });
				sETHContract = getContract({ target: 'ProxysETH', source: 'Synth' });
				SystemSettings = getContract({ target: 'SystemSettings' });

				Liquidations = getContract({ target: 'Liquidations' });

				ExchangeRates = getContract({ target: 'ExchangeRates' });
			});

			describe('default system settings', () => {
				it('defaults are properly configured in a fresh deploy', async () => {
					assert.strictEqual((await Exchanger.waitingPeriodSecs()).toString(), WAITING_PERIOD_SECS);
					assert.strictEqual(
						(await Exchanger.priceDeviationThresholdFactor()).toString(),
						PRICE_DEVIATION_THRESHOLD_FACTOR
					);
					assert.strictEqual(await Exchanger.tradingRewardsEnabled(), TRADING_REWARDS_ENABLED);
					assert.strictEqual((await Issuer.issuanceRatio()).toString(), ISSUANCE_RATIO);
					assert.strictEqual((await FeePool.feePeriodDuration()).toString(), FEE_PERIOD_DURATION);
					assert.strictEqual(
						(await FeePool.targetThreshold()).toString(),
						ethers.utils.parseEther((TARGET_THRESHOLD / 100).toString()).toString()
					);

					assert.strictEqual((await Liquidations.liquidationDelay()).toString(), LIQUIDATION_DELAY);
					assert.strictEqual((await Liquidations.liquidationRatio()).toString(), LIQUIDATION_RATIO);
					assert.strictEqual(
						(await Liquidations.liquidationPenalty()).toString(),
						LIQUIDATION_PENALTY
					);
					assert.strictEqual((await ExchangeRates.rateStalePeriod()).toString(), RATE_STALE_PERIOD);
					assert.strictEqual(
						(await DebtCache.debtSnapshotStaleTime()).toString(),
						DEBT_SNAPSHOT_STALE_TIME
					);
					assert.strictEqual((await Issuer.minimumStakeTime()).toString(), MINIMUM_STAKE_TIME);
					for (const [category, rate] of Object.entries(EXCHANGE_FEE_RATES)) {
						// take the first synth we can find from that category, ignoring ETH and BTC as
						// they deviate from the rest of the synth fee category defaults
						const synth = synths.find(
							({ category: c, name }) => c === category && !/^.(BTC|ETH)$/.test(name)
						);

						assert.strictEqual(
							(
								await Exchanger.feeRateForExchange(toBytes32('(ignored)'), toBytes32(synth.name))
							).toString(),
							rate
						);
					}
				});

				describe('when defaults are changed', () => {
					let newWaitingPeriod;
					let newPriceDeviation;
					let newIssuanceRatio;
					let newFeePeriodDuration;
					let newTargetThreshold;
					let newLiquidationsDelay;
					let newLiquidationsRatio;
					let newLiquidationsPenalty;
					let newRateStalePeriod;
					let newRateForsUSD;
					let newMinimumStakeTime;
					let newDebtSnapshotStaleTime;

					beforeEach(async () => {
						newWaitingPeriod = '10';
						newPriceDeviation = ethers.utils.parseEther('0.45').toString();
						newIssuanceRatio = ethers.utils.parseEther('0.25').toString();
						newFeePeriodDuration = (3600 * 24 * 3).toString(); // 3 days
						newTargetThreshold = '6';
						newLiquidationsDelay = newFeePeriodDuration;
						newLiquidationsRatio = ethers.utils.parseEther('0.6').toString(); // must be above newIssuanceRatio * 2
						newLiquidationsPenalty = ethers.utils.parseEther('0.25').toString();
						newRateStalePeriod = '3400';
						newRateForsUSD = ethers.utils.parseEther('0.1').toString();
						newMinimumStakeTime = '3999';
						newDebtSnapshotStaleTime = '43200'; // Half a day

						let tx;

						tx = await SystemSettings.setWaitingPeriodSecs(newWaitingPeriod, overrides);
						await tx.wait();

						tx = await SystemSettings.setPriceDeviationThresholdFactor(
							newPriceDeviation,
							overrides
						);
						await tx.wait();

						tx = await SystemSettings.setIssuanceRatio(newIssuanceRatio, overrides);
						await tx.wait();

						tx = await SystemSettings.setFeePeriodDuration(newFeePeriodDuration, overrides);
						await tx.wait();

						tx = await SystemSettings.setTargetThreshold(newTargetThreshold, overrides);
						await tx.wait();

						tx = await SystemSettings.setLiquidationDelay(newLiquidationsDelay, overrides);
						await tx.wait();

						tx = await SystemSettings.setLiquidationRatio(newLiquidationsRatio, overrides);
						await tx.wait();

						tx = await SystemSettings.setLiquidationPenalty(newLiquidationsPenalty, overrides);
						await tx.wait();

						tx = await SystemSettings.setRateStalePeriod(newRateStalePeriod, overrides);
						await tx.wait();

						tx = await SystemSettings.setDebtSnapshotStaleTime(newDebtSnapshotStaleTime, overrides);
						await tx.wait();

						tx = await SystemSettings.setMinimumStakeTime(newMinimumStakeTime, overrides);
						await tx.wait();

						tx = await SystemSettings.setExchangeFeeRateForSynths(
							[toBytes32('sUSD')],
							[newRateForsUSD],
							overrides
						);
						await tx.wait();
					});
					describe('when redeployed with a new system settings contract', () => {
						beforeEach(async () => {
							// read current config file version (if something has been removed,
							// we don't want to include it here)
							const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
							const configForExrates = Object.keys(currentConfigFile).reduce((memo, cur) => {
								memo[cur] = { deploy: cur === 'SystemSettings' };
								return memo;
							}, {});

							fs.writeFileSync(configJSONPath, JSON.stringify(configForExrates));

							await commands.deploy({
								concurrency,
								network,
								yes: true,
								privateKey: accounts.deployer.privateKey,
							});
						});
						it('then the defaults remain unchanged', async () => {
							assert.strictEqual(
								(await Exchanger.waitingPeriodSecs()).toString(),
								newWaitingPeriod
							);
							assert.strictEqual(
								(await Exchanger.priceDeviationThresholdFactor()).toString(),
								newPriceDeviation
							);
							assert.strictEqual((await Issuer.issuanceRatio()).toString(), newIssuanceRatio);
							assert.strictEqual(
								(await FeePool.feePeriodDuration()).toString(),
								newFeePeriodDuration
							);
							assert.strictEqual(
								(await FeePool.targetThreshold()).toString(),
								ethers.utils.parseEther((newTargetThreshold / 100).toString()).toString()
							);
							assert.strictEqual(
								(await Liquidations.liquidationDelay()).toString(),
								newLiquidationsDelay
							);
							assert.strictEqual(
								(await Liquidations.liquidationRatio()).toString(),
								newLiquidationsRatio
							);
							assert.strictEqual(
								(await Liquidations.liquidationPenalty()).toString(),
								newLiquidationsPenalty
							);
							assert.strictEqual(
								(await ExchangeRates.rateStalePeriod()).toString(),
								newRateStalePeriod
							);
							assert.strictEqual((await Issuer.minimumStakeTime()).toString(), newMinimumStakeTime);
							assert.strictEqual(
								(
									await Exchanger.feeRateForExchange(toBytes32('(ignored)'), toBytes32('sUSD'))
								).toString(),
								newRateForsUSD
							);
						});
					});
				});
			});

			describe('synths added to Issuer', () => {
				const hexToString = hex => ethers.utils.toUtf8String(hex).replace(/\0/g, '');

				it('then all synths are added to the issuer', async () => {
					const keys = await Issuer.availableCurrencyKeys();
					assert.deepStrictEqual(
						keys.map(hexToString),
						JSON.parse(synthsJSON).map(({ name }) => name)
					);
				});
				describe('when only sUSD and sETH is chosen as a synth', () => {
					beforeEach(async () => {
						fs.writeFileSync(
							synthsJSONPath,
							JSON.stringify([
								{ name: 'sUSD', asset: 'USD' },
								{ name: 'sETH', asset: 'ETH' },
							])
						);
					});
					describe('when Issuer redeployed', () => {
						beforeEach(async () => {
							const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
							const configForExrates = Object.keys(currentConfigFile).reduce((memo, cur) => {
								memo[cur] = { deploy: cur === 'Issuer' };
								return memo;
							}, {});

							fs.writeFileSync(configJSONPath, JSON.stringify(configForExrates));

							await commands.deploy({
								concurrency,
								addNewSynths: true,
								network,
								yes: true,
								privateKey: accounts.deployer.privateKey,
							});
							targets = getTarget();
							Issuer = getContract({ target: 'Issuer' });
						});
						it('then only sUSD is added to the issuer', async () => {
							const keys = await Issuer.availableCurrencyKeys();
							assert.deepStrictEqual(keys.map(hexToString), ['sUSD', 'sETH']);
						});
					});
				});
			});
			describe('deploy-staking-rewards', () => {
				beforeEach(async () => {
					const rewardsToDeploy = [
						'sETHUniswapV1',
						'sXAUUniswapV2',
						'sUSDCurve',
						'iETH',
						'iETH2',
						'iETH3',
						'iBTC',
						'SNXBalancer',
					];

					await commands.deployStakingRewards({
						network,
						yes: true,
						privateKey: accounts.deployer.privateKey,
						rewardsToDeploy,
					});

					rewards = getStakingRewards();
					sources = getSource();
					targets = getTarget();
				});

				it('script works as intended', async () => {
					for (const { name, stakingToken, rewardsToken } of rewards) {
						const stakingRewardsName = `StakingRewards${name}`;
						const stakingRewardsContract = getContract({ target: stakingRewardsName });

						// Test staking / rewards token address
						const tokens = [
							{ token: stakingToken, method: 'stakingToken' },
							{ token: rewardsToken, method: 'rewardsToken' },
						];

						for (const { token, method } of tokens) {
							const tokenAddress = await stakingRewardsContract[method]();

							if (ethers.utils.isAddress(token)) {
								assert.strictEqual(token.toLowerCase(), tokenAddress.toLowerCase());
							} else {
								assert.strictEqual(
									tokenAddress.toLowerCase(),
									targets[token].address.toLowerCase()
								);
							}
						}

						// Test rewards distribution address
						const rewardsDistributionAddress = await stakingRewardsContract.rewardsDistribution();
						assert.strictEqual(
							rewardsDistributionAddress.toLowerCase(),
							targets['RewardsDistribution'].address.toLowerCase()
						);
					}
				});
			});

			describe('deploy-shorting-rewards', () => {
				beforeEach(async () => {
					const rewardsToDeploy = ['sBTC', 'sETH'];

					await commands.deployShortingRewards({
						network,
						yes: true,
						privateKey: accounts.deployer.privateKey,
						rewardsToDeploy,
					});

					rewards = getShortingRewards();
					sources = getSource();
					targets = getTarget();
				});

				it('script works as intended', async () => {
					for (const { name, rewardsToken } of rewards) {
						const shortingRewardsName = `ShortingRewards${name}`;
						const shortingRewardsContract = getContract({ target: shortingRewardsName });

						const tokenAddress = await shortingRewardsContract.rewardsToken();

						if (ethers.utils.isAddress(rewardsToken)) {
							assert.strictEqual(rewardsToken.toLowerCase(), tokenAddress.toLowerCase());
						} else {
							assert.strictEqual(
								tokenAddress.toLowerCase(),
								targets[rewardsToken].address.toLowerCase()
							);
						}

						// Test rewards distribution address should be the deployer, since we are
						// funding by the sDAO for the trial.
						const rewardsDistributionAddress = await shortingRewardsContract.rewardsDistribution();
						assert.strictEqual(
							rewardsDistributionAddress.toLowerCase(),
							accounts.deployer.address.toLowerCase()
						);
					}
				});
			});

			describe('importFeePeriods', () => {
				let feePeriodLength;

				beforeEach(async () => {
					feePeriodLength = await callMethodWithRetry(FeePool.FEE_PERIOD_LENGTH());
				});

				const daysAgo = days => Math.round(Date.now() / 1000 - 3600 * 24 * days);

				const redeployFeePeriodOnly = async function() {
					// read current config file version (if something has been removed,
					// we don't want to include it here)
					const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
					const configForExrates = Object.keys(currentConfigFile).reduce((memo, cur) => {
						memo[cur] = { deploy: cur === 'FeePool' };
						return memo;
					}, {});

					fs.writeFileSync(configJSONPath, JSON.stringify(configForExrates));

					await commands.deploy({
						concurrency,
						network,
						yes: true,
						privateKey: accounts.deployer.privateKey,
					});
				};

				describe('when FeePool is given three true imported periods', () => {
					let periodsAdded;
					beforeEach(async () => {
						periodsAdded = [];
						const addPeriod = (feePeriodId, startTime) => {
							periodsAdded.push([`${feePeriodId}`, '0', `${startTime}`, '3', '4', '5', '6']);
						};
						for (let i = 0; i < feePeriodLength; i++) {
							const startTime = daysAgo((i + 1) * 6);
							addPeriod((i + 1).toString(), startTime.toString());

							const tx = await FeePool.importFeePeriod(
								i,
								i + 1,
								0,
								startTime,
								3,
								4,
								5,
								6,
								overrides
							);
							await tx.wait();
						}
					});

					describe('when the system is suspended', () => {
						beforeEach(async () => {
							await getContract({ target: 'SystemStatus' }).suspendSystem('1', {
								from: accounts.deployer.address,
							});
						});
						describe('when FeePool alone is redeployed', () => {
							beforeEach(redeployFeePeriodOnly);
							describe('using the FeePoolNew', () => {
								let FeePoolNew;
								beforeEach(async () => {
									targets = getTarget();
									FeePoolNew = getContract({ target: 'FeePool' });
								});

								it('then the periods are added correctly', async () => {
									let periods = await Promise.all(
										[0, 1].map(i => callMethodWithRetry(FeePoolNew.recentFeePeriods(i)))
									);
									// strip index props off the returned object
									periods.forEach(period =>
										Object.keys(period)
											.filter(key => /^[0-9]+$/.test(key))
											.forEach(key => delete period[key])
									);

									periods = periods.map(period => period.map(bn => bn.toString()));

									assert.strictEqual(JSON.stringify(periods[0]), JSON.stringify(periodsAdded[0]));
									assert.strictEqual(JSON.stringify(periods[1]), JSON.stringify(periodsAdded[1]));
								});
							});
						});
					});
				});
			});

			describe('when ExchangeRates has prices SNX $0.30 and all synths $1', () => {
				beforeEach(async () => {
					// set default issuance of 0.2
					const tx = await SystemSettings.setIssuanceRatio(
						ethers.utils.parseEther('0.2'),
						overrides
					);
					await tx.wait();

					// make sure exchange rates has prices for specific assets

					const answersToSet = [{ asset: 'SNX', rate: 0.3 }].concat(
						synths.map(({ inverted, asset }) => {
							// as the same assets are used for long and shorts, search by asset rather than
							// name (currencyKey) here so that we don't accidentially override an inverse with
							// another rate
							if (asset === 'DEFI') {
								// ensure iDEFI is frozen at the lower limit, by setting the incoming rate
								// above the upper limit
								return {
									asset,
									rate: 9999999999,
								};
							} else if (asset === 'TRX') {
								// ensure iTRX is frozen at the upper limit, by setting the incoming rate
								// below the lower limit
								return {
									asset,
									rate: 0.000001,
								};
							} else if (asset === 'BNB') {
								// ensure iBNB is not frozen
								return {
									asset,
									rate: synths.find(synth => synth.inverted && synth.asset === asset).inverted
										.entryPoint,
								};
							} else if (asset === 'XTZ') {
								// ensure iXTZ is frozen at upper limit
								return {
									asset,
									rate: 0.000001,
								};
							} else if (asset === 'CEX') {
								// ensure iCEX is frozen at lower limit
								return {
									asset,
									rate: 9999999999,
								};
							}
							return {
								asset,
								rate: 1,
							};
						})
					);

					for (const { asset, rate } of answersToSet) {
						await setAggregatorAnswer({ asset, rate });
					}
				});

				describe('when transferring 100k SNX to user1', () => {
					beforeEach(async () => {
						// transfer SNX to first account
						const tx = await Synthetix.transfer(
							accounts.first.address,
							ethers.utils.parseEther('100000'),
							overrides
						);
						await tx.wait();
					});

					describe('when user1 issues all possible sUSD', () => {
						beforeEach(async () => {
							Synthetix = Synthetix.connect(accounts.first);

							const tx = await Synthetix.issueMaxSynths(overrides);
							await tx.wait();
						});
						it('then the sUSD balanced must be 100k * 0.3 * 0.2 (default SystemSettings.issuanceRatio) = 6000', async () => {
							const balance = await callMethodWithRetry(
								sUSDContract.balanceOf(accounts.first.address)
							);
							assert.strictEqual(
								ethers.utils.formatEther(balance.toString()),
								'6000.0',
								'Balance should match'
							);
						});
						describe('when user1 exchange 1000 sUSD for sETH (the MultiCollateralSynth)', () => {
							let sETHBalanceAfterExchange;
							beforeEach(async () => {
								await Synthetix.exchange(sUSD, ethers.utils.parseEther('1000'), sETH, overrides);
								sETHBalanceAfterExchange = await callMethodWithRetry(
									sETHContract.balanceOf(accounts.first.address)
								);
							});
							it('then their sUSD balance is 5000', async () => {
								const balance = await callMethodWithRetry(
									sUSDContract.balanceOf(accounts.first.address)
								);
								assert.strictEqual(
									ethers.utils.formatEther(balance.toString()),
									'5000.0',
									'Balance should match'
								);
							});
							it('and their sETH balance is 1000 - the fee', async () => {
								const { amountReceived } = await callMethodWithRetry(
									Exchanger.getAmountsForExchange(ethers.utils.parseEther('1000'), sUSD, sETH)
								);
								assert.strictEqual(
									ethers.utils.formatEther(sETHBalanceAfterExchange.toString()),
									ethers.utils.formatEther(amountReceived.toString()),
									'Balance should match'
								);
							});
						});
						describe('when user1 exchange 1000 sUSD for sBTC', () => {
							let sBTCBalanceAfterExchange;
							beforeEach(async () => {
								const tx = await Synthetix.exchange(
									sUSD,
									ethers.utils.parseEther('1000'),
									sBTC,
									overrides
								);
								await tx.wait();
								sBTCBalanceAfterExchange = await callMethodWithRetry(
									sBTCContract.balanceOf(accounts.first.address)
								);
							});
							it('then their sUSD balance is 5000', async () => {
								const balance = await callMethodWithRetry(
									sUSDContract.balanceOf(accounts.first.address)
								);
								assert.strictEqual(
									ethers.utils.formatEther(balance.toString()),
									'5000.0',
									'Balance should match'
								);
							});
							it('and their sBTC balance is 1000 - the fee', async () => {
								const { amountReceived } = await callMethodWithRetry(
									Exchanger.getAmountsForExchange(ethers.utils.parseEther('1000'), sUSD, sBTC)
								);
								assert.strictEqual(
									ethers.utils.formatEther(sBTCBalanceAfterExchange.toString()),
									ethers.utils.formatEther(amountReceived.toString()),
									'Balance should match'
								);
							});
							describe('when user1 burns 10 sUSD', () => {
								beforeEach(async () => {
									let tx;

									// set minimumStakeTime to 0 seconds for burning
									tx = await SystemSettings.setMinimumStakeTime(0, overrides);
									await tx.wait();

									// burn
									tx = await Synthetix.burnSynths(ethers.utils.parseEther('10'), overrides);
									await tx.wait();
								});
								it('then their sUSD balance is 4990', async () => {
									const balance = await callMethodWithRetry(
										sUSDContract.balanceOf(accounts.first.address)
									);
									assert.strictEqual(
										ethers.utils.formatEther(balance.toString()),
										'4990.0',
										'Balance should match'
									);
								});

								describe('when deployer replaces sBTC with PurgeableSynth', () => {
									beforeEach(async () => {
										await commands.replaceSynths({
											network,
											yes: true,
											privateKey: accounts.deployer.privateKey,
											subclass: 'PurgeableSynth',
											synthsToReplace: ['sBTC'],
											methodCallGasLimit: gasLimit,
										});
									});
									describe('and deployer invokes purge', () => {
										beforeEach(async () => {
											await fastForward({ seconds: 500, provider }); // fast forward through waiting period

											await commands.purgeSynths({
												network,
												yes: true,
												privateKey: accounts.deployer.privateKey,
												addresses: [accounts.first.address],
												synthsToPurge: ['sBTC'],
												gasLimit,
											});
										});
										it('then their sUSD balance is 4990 + sBTCBalanceAfterExchange', async () => {
											const balance = await callMethodWithRetry(
												sUSDContract.balanceOf(accounts.first.address)
											);
											const [amountReceived] = await callMethodWithRetry(
												Exchanger.getAmountsForExchange(sBTCBalanceAfterExchange, sBTC, sUSD)
											);
											assert.strictEqual(
												ethers.utils.formatEther(balance.toString()),
												(4990 + +ethers.utils.formatEther(amountReceived.toString())).toString(),
												'Balance should match'
											);
										});
										it('and their sBTC balance is 0', async () => {
											const balance = await callMethodWithRetry(
												sBTCContract.balanceOf(accounts.first.address)
											);
											assert.strictEqual(
												ethers.utils.formatEther(balance.toString()),
												'0.0',
												'Balance should match'
											);
										});
									});
								});
							});
						});
						describe('synth suspension', () => {
							let SystemStatus;
							describe('when one synth has a price well outside of range, triggering price deviation', () => {
								beforeEach(async () => {
									SystemStatus = getContract({ target: 'SystemStatus' });
									await setAggregatorAnswer({ asset: 'ETH', rate: 20 });
								});
								it('when exchange occurs into that synth, the synth is suspended', async () => {
									const tx = await Synthetix.exchange(
										sUSD,
										ethers.utils.parseEther('1'),
										sETH,
										overrides
									);
									await tx.wait();

									const { suspended, reason } = await SystemStatus.synthSuspension(sETH);
									assert.strictEqual(suspended, true);
									assert.strictEqual(reason.toString(), '65');
								});
							});
						});
					});

					describe('handle updates to inverted rates', () => {
						describe('when a user has issued and exchanged into iCEX', () => {
							beforeEach(async () => {
								let tx;

								Synthetix = Synthetix.connect(accounts.first);

								tx = await Synthetix.issueMaxSynths(overrides);
								await tx.wait();

								tx = await Synthetix.exchange(
									toBytes32('sUSD'),
									ethers.utils.parseEther('100'),
									toBytes32('iCEX'),
									overrides
								);
								await tx.wait();
							});
							describe('when a new inverted synth iABC is added to the list', () => {
								describe('and the inverted synth iXTZ has its parameters shifted', () => {
									describe('and the inverted synth iCEX has its parameters shifted as well', () => {
										beforeEach(async () => {
											// read current config file version (if something has been removed,
											// we don't want to include it here)
											const currentSynthsFile = JSON.parse(fs.readFileSync(synthsJSONPath));

											// add new iABC synth
											currentSynthsFile.push({
												name: 'iABC',
												asset: 'ABC',
												category: 'crypto',
												sign: '',
												description: 'Inverted Alphabet',
												subclass: 'PurgeableSynth',
												inverted: {
													entryPoint: 1,
													upperLimit: 1.5,
													lowerLimit: 0.5,
												},
											});

											// mutate parameters of iXTZ
											// Note: this is brittle and will *break* if iXTZ or iCEX are removed from the
											// synths for deployment. This needs to be improved in the near future - JJ
											currentSynthsFile.find(({ name }) => name === 'iXTZ').inverted = {
												entryPoint: 100,
												upperLimit: 150,
												lowerLimit: 50,
											};

											// mutate parameters of iCEX
											currentSynthsFile.find(({ name }) => name === 'iCEX').inverted = {
												entryPoint: 1,
												upperLimit: 1.5,
												lowerLimit: 0.5,
											};

											fs.writeFileSync(synthsJSONPath, JSON.stringify(currentSynthsFile));
										});

										describe('when ExchangeRates alone is redeployed', () => {
											let ExchangeRates;
											let currentConfigFile;
											beforeEach(async () => {
												// read current config file version (if something has been removed,
												// we don't want to include it here)
												currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
												const configForExrates = Object.keys(currentConfigFile).reduce(
													(memo, cur) => {
														memo[cur] = { deploy: cur === 'ExchangeRates' };
														return memo;
													},
													{}
												);

												fs.writeFileSync(configJSONPath, JSON.stringify(configForExrates));

												await commands.deploy({
													concurrency,
													addNewSynths: true,
													network,
													yes: true,
													privateKey: accounts.deployer.privateKey,
												});
												targets = getTarget();
												ExchangeRates = getContract({ target: 'ExchangeRates' });
											});

											// Test the properties of an inverted synth
											const testInvertedSynth = async ({
												currencyKey,
												shouldBeFrozenAtUpperLimit,
												shouldBeFrozenAtLowerLimit,
											}) => {
												const [
													entryPoint,
													upperLimit,
													lowerLimit,
													frozenAtUpperLimit,
													frozenAtLowerLimit,
												] = await callMethodWithRetry(
													ExchangeRates.inversePricing(toBytes32(currencyKey))
												);
												const expected = synths.find(({ name }) => name === currencyKey).inverted;
												assert.strictEqual(
													+ethers.utils.formatEther(entryPoint.toString()),
													expected.entryPoint,
													'Entry points match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(upperLimit.toString()),
													expected.upperLimit,
													'Upper limits match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(lowerLimit.toString()),
													expected.lowerLimit,
													'Lower limits match'
												);
												assert.strictEqual(
													frozenAtUpperLimit,
													!!shouldBeFrozenAtUpperLimit,
													'Frozen upper matches expectation'
												);

												assert.strictEqual(
													frozenAtLowerLimit,
													!!shouldBeFrozenAtLowerLimit,
													'Frozen lower matches expectation'
												);
											};

											it('then the new iABC synth should be added correctly (as it has no previous rate)', async () => {
												const iABC = toBytes32('iABC');
												const [
													entryPoint,
													upperLimit,
													lowerLimit,
													frozenAtUpperLimit,
													frozenAtLowerLimit,
												] = await callMethodWithRetry(ExchangeRates.inversePricing(iABC));
												const rate = await callMethodWithRetry(ExchangeRates.rateForCurrency(iABC));

												assert.strictEqual(
													+ethers.utils.formatEther(entryPoint.toString()),
													1,
													'Entry point match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(upperLimit.toString()),
													1.5,
													'Upper limit match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(lowerLimit.toString()),
													0.5,
													'Lower limit match'
												);
												assert.strictEqual(
													frozenAtUpperLimit || frozenAtLowerLimit,
													false,
													'Is not frozen'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(rate.toString()),
													0,
													'No rate for new inverted synth'
												);
											});

											it('and the iXTZ synth should be reconfigured correctly (as it has 0 total supply)', async () => {
												const iXTZ = toBytes32('iXTZ');
												const [
													entryPoint,
													upperLimit,
													lowerLimit,
													frozenAtUpperLimit,
													frozenAtLowerLimit,
												] = await callMethodWithRetry(ExchangeRates.inversePricing(iXTZ));

												assert.strictEqual(
													+ethers.utils.formatEther(entryPoint.toString()),
													100,
													'Entry point match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(upperLimit.toString()),
													150,
													'Upper limit match'
												);
												assert.strictEqual(
													+ethers.utils.formatEther(lowerLimit.toString()),
													50,
													'Lower limit match'
												);
												// the old rate (2 x upperLimit) is applied with the new entry point, and
												// as it is very low, when we fetch the rate, it will return at the upper limit,
												// but as freezeRate is a keeper it hasn't been called yet, so it won't return as frozenAtUpper
												assert.strictEqual(
													frozenAtUpperLimit || frozenAtLowerLimit,
													false,
													'Is not frozen'
												);

												// so perform  freeze
												const tx = await ExchangeRates.freezeRate(iXTZ, overrides);
												await tx.wait();

												const [, , , newFrozenAtUpperLimit] = await callMethodWithRetry(
													ExchangeRates.inversePricing(iXTZ)
												);

												assert.strictEqual(
													newFrozenAtUpperLimit,
													true,
													'Is now frozen at upper limit'
												);
											});

											it('and the iCEX synth should not be inverted at all', async () => {
												const [entryPoint] = await callMethodWithRetry(
													ExchangeRates.inversePricing(toBytes32('iCEX'))
												);

												assert.strictEqual(
													+ethers.utils.formatEther(entryPoint.toString()),
													0,
													'iCEX should not be set'
												);
											});

											it('and iDEFI should be set as frozen at the lower limit', async () => {
												await testInvertedSynth({
													currencyKey: 'iDEFI',
													shouldBeFrozenAtLowerLimit: true,
												});
											});
											it('and iTRX should be set as frozen at the upper limit', async () => {
												await testInvertedSynth({
													currencyKey: 'iTRX',
													shouldBeFrozenAtUpperLimit: true,
												});
											});
											it('and iBNB should not be frozen', async () => {
												await testInvertedSynth({
													currencyKey: 'iBNB',
												});
											});

											// Note: this is destructive as it removes the sBTC contracts and thus future calls to deploy will fail
											// Either have this at the end of the entire test script or manage configuration of deploys by passing in
											// files to update rather than a file.
											describe('when deployer invokes remove of iABC', () => {
												beforeEach(async () => {
													await commands.removeSynths({
														network,
														yes: true,
														privateKey: accounts.deployer.privateKey,
														synthsToRemove: ['iABC'],
													});
												});

												describe('when user tries to exchange into iABC', () => {
													it('then it fails', async () => {
														let failed;
														try {
															const tx = await Synthetix.exchange(
																toBytes32('iCEX'),
																ethers.utils.parseEther('1000'),
																toBytes32('iABC'),
																overrides
															);
															await tx.wait();

															failed = false;
														} catch (err) {
															failed = true;
														}

														assert.equal(failed, true);
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

			describe('when a pricing aggregator exists', () => {
				let mockAggregator;
				beforeEach(async () => {
					mockAggregator = await createMockAggregator();
				});
				describe('when Synthetix.anySynthOrSNXRateIsInvalid() is invoked', () => {
					it('then it returns true as expected', async () => {
						const response = await Synthetix.anySynthOrSNXRateIsInvalid();
						assert.strictEqual(response, true, 'anySynthOrSNXRateIsInvalid must be true');
					});
				});
				describe('when one synth is configured to have a pricing aggregator', () => {
					beforeEach(async () => {
						const currentFeeds = JSON.parse(fs.readFileSync(feedsJSONPath));

						// mutate parameters of EUR - instructing it to use the mock aggregator as a feed
						currentFeeds['EUR'].feed = mockAggregator.address;

						fs.writeFileSync(feedsJSONPath, JSON.stringify(currentFeeds));
					});
					describe('when a deployment with nothing set to deploy fresh is run', () => {
						let ExchangeRates;
						beforeEach(async () => {
							const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
							const configForExrates = Object.keys(currentConfigFile).reduce((memo, cur) => {
								memo[cur] = { deploy: false };
								return memo;
							}, {});

							fs.writeFileSync(configJSONPath, JSON.stringify(configForExrates));

							await commands.deploy({
								concurrency,
								network,
								yes: true,
								privateKey: accounts.deployer.privateKey,
							});
							targets = getTarget();

							ExchangeRates = getContract({ target: 'ExchangeRates' });
						});
						it('then the aggregator must be set for the sEUR price', async () => {
							const sEURAggregator = await callMethodWithRetry(
								ExchangeRates.aggregators(toBytes32('sEUR'))
							);
							assert.strictEqual(sEURAggregator, mockAggregator.address);
						});

						describe('when ExchangeRates has rates for all synths except the aggregated synth sEUR', () => {
							beforeEach(async () => {
								// update rates
								const synthsToUpdate = synths
									.filter(({ name }) => name !== 'sEUR')
									.concat({ asset: 'SNX', rate: 1 });

								for (const { asset } of synthsToUpdate) {
									await setAggregatorAnswer({ asset, rate: 1 });
								}
							});
							describe('when Synthetix.anySynthOrSNXRateIsInvalid() is invoked', () => {
								it('then it returns true as sEUR still is', async () => {
									const response = await Synthetix.anySynthOrSNXRateIsInvalid();
									assert.strictEqual(response, true, 'anySynthOrSNXRateIsInvalid must be true');
								});
							});

							describe('when the aggregator has a price', () => {
								const rate = '1.15';
								let newTs;
								beforeEach(async () => {
									newTs = timestamp + 300;
									const tx = await mockAggregator.setLatestAnswer(
										(rate * 1e8).toFixed(0),
										newTs,
										overrides
									);
									await tx.wait();
								});
								describe('then the price from exchange rates for that currency key uses the aggregator', () => {
									it('correctly returns the rate', async () => {
										const response = await callMethodWithRetry(
											ExchangeRates.rateForCurrency(toBytes32('sEUR'))
										);
										assert.strictEqual(ethers.utils.formatEther(response.toString()), rate);
									});
								});

								describe('when Synthetix.anySynthOrSNXRateIsInvalid() is invoked', () => {
									it('then it returns false as expected', async () => {
										const response = await Synthetix.anySynthOrSNXRateIsInvalid();
										assert.strictEqual(response, false, 'anySynthOrSNXRateIsInvalid must be false');
									});
								});
							});
						});
					});
				});
			});

			describe('AddressResolver consolidation', () => {
				let ReadProxyAddressResolver;
				beforeEach(async () => {
					ReadProxyAddressResolver = getContract({ target: 'ReadProxyAddressResolver' });
				});
				describe('when the AddressResolver is set to deploy and everything else false', () => {
					beforeEach(async () => {
						const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
						const configForAddressResolver = Object.keys(currentConfigFile).reduce((memo, cur) => {
							memo[cur] = { deploy: cur === 'AddressResolver' };
							return memo;
						}, {});

						fs.writeFileSync(configJSONPath, JSON.stringify(configForAddressResolver));
					});
					describe('when re-deployed', () => {
						let AddressResolver;
						beforeEach(async () => {
							await commands.deploy({
								concurrency,
								network,
								yes: true,
								privateKey: accounts.deployer.privateKey,
							});
							targets = getTarget();

							AddressResolver = getContract({ target: 'AddressResolver' });
						});
						it('then the read proxy address resolver is updated', async () => {
							assert.strictEqual(await ReadProxyAddressResolver.target(), AddressResolver.address);
						});
						it('and the resolver has all the addresses inside', async () => {
							const targets = getTarget();

							const responses = await Promise.all(
								[
									'DebtCache',
									'DelegateApprovals',
									'Depot',
									'Exchanger',
									'ExchangeRates',
									'ExchangeState',
									'FeePool',
									'FeePoolEternalStorage',
									'FeePoolState',
									'Issuer',
									'Liquidations',
									'RewardEscrow',
									'RewardsDistribution',
									'SupplySchedule',
									'Synthetix',
									'SynthetixEscrow',
									'SynthetixState',
									'SynthsETH',
									'SynthsUSD',
									'SystemStatus',
								].map(contractName =>
									callMethodWithRetry(
										AddressResolver.getAddress(snx.toBytes32(contractName))
									).then(found => ({ contractName, ok: found === targets[contractName].address }))
								)
							);

							for (const { contractName, ok } of responses) {
								assert.ok(ok, `${contractName} incorrect in resolver`);
							}
						});
					});
				});
				describe('when Exchanger is marked to deploy, and everything else false', () => {
					beforeEach(async () => {
						const currentConfigFile = JSON.parse(fs.readFileSync(configJSONPath));
						const configForExchanger = Object.keys(currentConfigFile).reduce((memo, cur) => {
							memo[cur] = { deploy: cur === 'Exchanger' };
							return memo;
						}, {});

						fs.writeFileSync(configJSONPath, JSON.stringify(configForExchanger));
					});
					describe('when re-deployed', () => {
						let AddressResolver;
						beforeEach(async () => {
							AddressResolver = getContract({ target: 'AddressResolver' });

							const existingExchanger = await callMethodWithRetry(
								AddressResolver.getAddress(snx.toBytes32('Exchanger'))
							);

							assert.strictEqual(existingExchanger, targets['Exchanger'].address);

							await commands.deploy({
								concurrency,
								network,
								yes: true,
								privateKey: accounts.deployer.privateKey,
							});
						});
						it('then the address resolver has the new Exchanger added to it', async () => {
							const targets = getTarget();

							const actualExchanger = await callMethodWithRetry(
								AddressResolver.getAddress(snx.toBytes32('Exchanger'))
							);

							assert.strictEqual(actualExchanger, targets['Exchanger'].address);
						});
						it('and all have resolver cached correctly', async () => {
							const targets = getTarget();

							const contractsWithResolver = await Promise.all(
								Object.entries(targets)
									// Note: SynthetixBridgeToOptimism and SynthetixBridgeToBase  have ':' in their deps, instead of hardcoding the
									// address here we should look up all required contracts and ignore any that have
									// ':' in it
									.filter(([contract]) => !/^SynthetixBridge/.test(contract))
									// Note: the VirtualSynth mastercopy is null-initialized and shouldn't be checked
									.filter(([contract]) => !/^VirtualSynthMastercopy/.test(contract))
									.filter(([, { source }]) =>
										sources[source].abi.find(({ name }) => name === 'resolver')
									)
									.map(([contract, { source, address }]) => {
										const Contract = new ethers.Contract(address, sources[source].abi, provider);
										return { contract, Contract };
									})
							);

							const readProxyAddress = ReadProxyAddressResolver.address;

							for (const { contract, Contract } of contractsWithResolver) {
								const isCached = await callMethodWithRetry(Contract.isResolverCached());
								assert.ok(isCached, `${contract}.isResolverCached() is false!`);
								assert.strictEqual(
									await callMethodWithRetry(Contract.resolver()),
									readProxyAddress,
									`${contract}.resolver is not the ReadProxyAddressResolver`
								);
							}
						});
					});
				});
			});
		});
	});
});
