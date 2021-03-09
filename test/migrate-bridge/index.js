const ethers = require('ethers');
const axios = require('axios');
const chalk = require('chalk');
const { toBytes32 } = require('../..');
const { Watcher } = require('@eth-optimism/watcher');
const { assert } = require('../contracts/common');
const { connectContract } = require('../optimism/utils/connectContract');
const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
	connectBridge: require('../../publish/src/commands/connect-bridge').connectBridge,
	deployOvmPair: require('../../publish/src/commands/deploy-ovm-pair').deployOvmPair,
};

const {
	constants: { OVM_MAX_GAS_LIMIT },
} = require('../../index');

/*
 * Tests a migration of bridges with ongoing withdrawals and deposits
 * while the migration occurs. SNX is only migrated from the original L1 bridge
 * to the new L1 bridge once all withdrawals that target it are finalized.
 *
 * How to run:
 * 1. Set optimism-integration FRAUD_PROOF_WINDOW_SECONDS to != 0 in docker-compose.env.yml
 * 2. Start optimism-integration `./up.sh`
 * 3. Run the tests: `npm run test:migrate-bridge`
 *
 * Notes:
 * Not intended to be run on CI.
 * This test is based on test:prod:ovm.
 * */
describe('Layer 2 bridge migration tests', () => {
	let SynthetixL1, SynthetixL2;

	let SynthetixBridgeToOptimismL1, SynthetixBridgeToBaseL2;
	let SynthetixBridgeToOptimismL1New, SynthetixBridgeToBaseL2New;

	const l1ProviderUrl = 'http://localhost:9545';
	const l2ProviderUrl = 'http://localhost:8545';
	const dataProviderUrl = 'http://localhost:8080';

	let providerL1, providerL2;

	let ownerAddress, ownerPrivateKey;
	let ownerL1, ownerL2;

	let watcher;

	// --------------------------
	// Setup
	// --------------------------

	let log;

	// Comment to see all output (e.g. deploy script output).
	before('silence output', async () => {
		log = console.log;
		console.log = () => {};
	});

	before('show elapsed time', async () => {
		let elapsedSeconds = 0;
		const startSeconds = Math.floor(new Date().getTime() / 1000);

		setInterval(() => {
			const now = Math.floor(new Date().getTime() / 1000);

			log(chalk.gray(`t = ${now - startSeconds}s`));
		}, 10 * 1000);
	});

	before('deploy L1 and L2 fresh instances', async () => {
		log(chalk.cyan('* Deploying fresh L1 and L2 instances...'));

		await commands.deployOvmPair({
			l1ProviderUrl,
			l2ProviderUrl,
			dataProviderUrl,
		});

		log(chalk.gray('> Instances deployed'));
	});

	before('set up providers', () => {
		providerL1 = new ethers.providers.JsonRpcProvider(l1ProviderUrl);
		providerL2 = new ethers.providers.JsonRpcProvider(l2ProviderUrl);
	});

	before('set up signers', () => {
		ownerAddress = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
		ownerPrivateKey = '0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7';

		ownerL1 = providerL1.getSigner(ownerAddress);
		ownerL2 = new ethers.Wallet(ownerPrivateKey, providerL2);
	});

	before('set up watchers', async () => {
		const response = await axios.get('http://localhost:8080/addresses.json');
		const addresses = response.data;

		watcher = new Watcher({
			l1: {
				provider: providerL1,
				messengerAddress: addresses['Proxy__OVM_L1CrossDomainMessenger'],
			},
			l2: {
				provider: providerL2,
				messengerAddress: '0x4200000000000000000000000000000000000007',
			},
		});
	});

	before('send dummy txs', async () => {
		// For the optimism-integration watchers to work properly when FRAUD_PROOF_WINDOW_SECONDS != 0
		setInterval(async () => {
			await ownerL2.sendTransaction({
				to: ownerAddress,
				value: 0,
				gasPrice: 0,
			});
		}, 5 * 1000);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: providerL1 });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: providerL2,
			});
			SynthetixBridgeToOptimismL1 = connectContract({
				contract: 'SynthetixBridgeToOptimism',
				provider: providerL1,
			});
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
				provider: providerL2,
			});
		});

		before('simulate exchange rates and debt cache', async () => {
			async function simulateExchangeRates({ provider, owner, useOvm }) {
				const Issuer = connectContract({
					contract: 'Issuer',
					source: useOvm ? 'IssuerWithoutLiquidations' : 'Issuer',
					provider,
					useOvm,
				});
				let ExchangeRates = connectContract({
					contract: 'ExchangeRates',
					source: useOvm ? 'ExchangeRatesWithoutInvPricing' : 'ExchangeRates',
					provider,
					useOvm,
				});
				let DebtCache = connectContract({
					contract: 'DebtCache',
					source: useOvm ? 'RealtimeDebtCache' : 'DebtCache',
					provider,
					useOvm,
				});

				let currencyKeys = await Issuer.availableCurrencyKeys();
				currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));
				const additionalKeys = ['SNX', 'ETH'].map(toBytes32); // The Depot uses the key "ETH" as opposed to "sETH" for its ether price
				currencyKeys.push(...additionalKeys);

				const { timestamp } = await provider.getBlock();
				let rates;
				if (useOvm) {
					rates = ['1700', '25', '1700'].map(ethers.utils.parseEther);
				} else {
					rates = currencyKeys.map(() => ethers.utils.parseEther('1'));
				}
				ExchangeRates = ExchangeRates.connect(owner);
				let tx = await ExchangeRates.updateRates(currencyKeys, rates, timestamp);
				await tx.wait();

				DebtCache = DebtCache.connect(owner);
				tx = await DebtCache.takeDebtSnapshot();
				await tx.wait();
			}

			await simulateExchangeRates({
				provider: providerL1,
				owner: ownerL1,
				useOvm: false,
			});
			await simulateExchangeRates({ provider: providerL2, owner: ownerL2, useOvm: true });
		});

		before('tweak system settings for tests', async () => {
			async function tweakSettings({ provider, owner, useOvm }) {
				let SystemSettings = connectContract({
					contract: 'SystemSettings',
					provider,
					useOvm,
				});
				SystemSettings = SystemSettings.connect(owner);

				await SystemSettings.setMinimumStakeTime(1);
			}

			await tweakSettings({ provider: providerL1, owner: ownerL1, useOvm: false });
			await tweakSettings({ provider: providerL2, owner: ownerL2, useOvm: true });
		});

		// --------------------------------------------------------
		// Initiate and finalize a deposit on L1 (original bridge)
		// --------------------------------------------------------

		const amountToDeposit = ethers.utils.parseEther('200');

		let initialOwnerBalanceL1, initialOwnerBalanceL2;

		before('record initial balances', async () => {
			initialOwnerBalanceL1 = await SynthetixL1.balanceOf(ownerAddress);
			initialOwnerBalanceL2 = await SynthetixL2.balanceOf(ownerAddress);
		});

		before('infinite approval for L1 bridge', async () => {
			SynthetixL1 = SynthetixL1.connect(ownerL1);

			const tx = await SynthetixL1.approve(
				SynthetixBridgeToOptimismL1.address,
				ethers.utils.parseEther('100000000')
			);
			await tx.wait();
		});

		describe('when a deposit is initialized and finalized with the original bridges', () => {
			let depositReceipt;

			before('deposit', async () => {
				SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ownerL1);

				const tx = await SynthetixBridgeToOptimismL1.deposit(amountToDeposit);
				depositReceipt = await tx.wait();
			});

			before('listen for completion', async () => {
				const [transactionHashL2] = await watcher.getMessageHashesFromL1Tx(
					depositReceipt.transactionHash
				);

				await watcher.getL2TransactionReceipt(transactionHashL2);
			});

			it('shows that the owners L1 balance decreased', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(ownerAddress),
					initialOwnerBalanceL1.sub(amountToDeposit)
				);
			});

			it('shows that the owners L2 balance increased', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(ownerAddress),
					initialOwnerBalanceL2.add(amountToDeposit)
				);
			});

			// ----------------------------------------------
			// Initiate a withdrawal on L2 (original bridge)
			// ----------------------------------------------

			const amountToWithdraw = ethers.utils.parseEther('100');

			describe('when a withdrawal is initiated with the original bridges', () => {
				let withdrawalReceipt;

				before('initiate withdrawal', async () => {
					SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(ownerL2);

					const tx = await SynthetixBridgeToBaseL2.withdraw(amountToWithdraw);
					withdrawalReceipt = await tx.wait();
				});

				it('shows that the owners L2 balance decreased', async () => {
					assert.bnEqual(
						await SynthetixL2.balanceOf(ownerAddress),
						initialOwnerBalanceL2.add(amountToDeposit).sub(amountToWithdraw)
					);
				});

				// -------------------------------
				// Deploy and connect new bridges
				// -------------------------------

				describe('when new bridges are deployed', () => {
					before('deploy new L2 bridge', async () => {
						// Commented out, because we can assume that the last compilation was for ovm
						// given the deployOvmPair call above.
						// await commands.build({ useOvm: true, optimizerRuns: 1, testHelpers: true });

						log(chalk.cyan('* Upgrading L2 bridge...'));

						await commands.deploy({
							concurrency: 1,
							network: 'local',
							yes: true,
							specifyContracts: 'SynthetixBridgeToBase',
							providerUrl: l2ProviderUrl,
							gasPrice: '0',
							useOvm: true,
							methodCallGasLimit: '3500000',
							contractDeploymentGasLimit: OVM_MAX_GAS_LIMIT,
							privateKey: ownerPrivateKey,
							ignoreCustomParameters: true,
						});

						log(chalk.gray('> L2 bridge upgraded'));

						SynthetixBridgeToBaseL2New = connectContract({
							contract: 'SynthetixBridgeToBase',
							provider: providerL2,
							useOvm: true,
						});
					});

					before('deploy new L1 bridge', async () => {
						log(chalk.cyan('* Upgrading L1 bridge...'));

						await commands.build({ useOvm: false, optimizerRuns: 200, testHelpers: true });

						await commands.deploy({
							concurrency: 1,
							network: 'local',
							yes: true,
							specifyContracts: 'SynthetixBridgeToOptimism',
							providerUrl: l1ProviderUrl,
							privateKey: ownerPrivateKey,
							ignoreCustomParameters: true,
						});

						log(chalk.gray('> L1 bridge upgraded'));

						SynthetixBridgeToOptimismL1New = connectContract({
							contract: 'SynthetixBridgeToOptimism',
							provider: providerL1,
						});
					});

					const getMessengers = async ({ dataProviderUrl }) => {
						const response = await axios.get(`${dataProviderUrl}/addresses.json`);
						const addresses = response.data;

						return {
							l1Messenger: addresses['Proxy__OVM_L1CrossDomainMessenger'],
							l2Messenger: '0x4200000000000000000000000000000000000007',
						};
					};

					before('connect bridges', async () => {
						log(chalk.cyan('* Connecting new bridges...'));

						const { l1Messenger, l2Messenger } = await getMessengers({ dataProviderUrl });

						await commands.connectBridge({
							l1Network: 'local',
							l2Network: 'local',
							l1ProviderUrl,
							l2ProviderUrl,
							l1Messenger,
							l2Messenger,
							l1PrivateKey: ownerPrivateKey,
							l2PrivateKey: ownerPrivateKey,
							l1GasPrice: 0,
							l2GasPrice: 0,
							gasLimit: 8000000,
						});

						log(chalk.gray('> New bridges connected'));
					});

					// -------------------------------
					// Make a new withdrawal
					// -------------------------------

					describe('when a withdrawal is initiated with the new bridges', () => {
						let newWithdrawalReceipt;

						before('initiate withdrawal', async () => {
							SynthetixBridgeToBaseL2New = SynthetixBridgeToBaseL2New.connect(ownerL2);

							const tx = await SynthetixBridgeToBaseL2New.withdraw(amountToWithdraw);
							newWithdrawalReceipt = await tx.wait();
						});

						it('shows that the owners L2 balance decreased', async () => {
							assert.bnEqual(
								await SynthetixL2.balanceOf(ownerAddress),
								initialOwnerBalanceL2
									.add(amountToDeposit)
									.sub(amountToWithdraw)
									.sub(amountToWithdraw)
							);
						});

						// -------------------------------
						// Original withdrawal finalizes
						// -------------------------------

						describe('when waiting for the original withdrawal to be finalized', () => {
							before('listen for completion', async () => {
								const [transactionHashL1] = await watcher.getMessageHashesFromL2Tx(
									withdrawalReceipt.transactionHash
								);

								await watcher.getL1TransactionReceipt(transactionHashL1);
							});

							it('shows that the owners L1 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL1.balanceOf(ownerAddress),
									initialOwnerBalanceL1.sub(amountToDeposit).add(amountToWithdraw)
								);
							});

							// ------------------------------
							// Migrate SNX to the new bridge
							// ------------------------------

							describe('when the bridge is migrated', () => {
								let bridgeBalanceBeforeMigration;

								before('record bridge balance', async () => {
									bridgeBalanceBeforeMigration = await SynthetixL1.balanceOf(
										SynthetixBridgeToOptimismL1.address
									);
								});

								before('migrate bridge SNX', async () => {
									const tx = await SynthetixBridgeToOptimismL1.migrateBridge(
										SynthetixBridgeToOptimismL1New.address
									);

									await tx.wait();
								});

								it('shows that the original L1 bridge is no longer active', async () => {
									assert.equal(
										await SynthetixBridgeToOptimismL1.activated(),
										false
									);
								});

								it('shows that the original bridge balance is zero', async () => {
									assert.bnEqual(
										await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address),
										ethers.utils.parseEther('0')
									);
								});

								it('shows that the new bridge balance is the same as the old one was', async () => {
									assert.bnEqual(
										await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1New.address),
										bridgeBalanceBeforeMigration
									);
								});

								// -------------------------
								// New withdrawal finalizes
								// -------------------------

								describe('when waiting for the new withdrawal to be finalized', () => {
									before('listen for completion', async () => {
										const [transactionHashL1] = await watcher.getMessageHashesFromL2Tx(
											newWithdrawalReceipt.transactionHash
										);

										await watcher.getL1TransactionReceipt(transactionHashL1);
									});

									it('shows that the owners L1 balance increased, and is equal to the its initial balance', async () => {
										assert.bnEqual(
											await SynthetixL1.balanceOf(ownerAddress),
											initialOwnerBalanceL1
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
