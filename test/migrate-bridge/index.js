const ethers = require('ethers');
const axios = require('axios');
const chalk = require('chalk');
const { toBytes32 } = require('../..');
const { Watcher } = require('@eth-optimism/watcher');
const { assert } = require('../contracts/common');
const { connectContract } = require('../optimism/utils/connectContract');

/*
 * Tests a migration of bridges with ongoing withdrawals and deposits
 * while the migration occurs. SNX is only migrated from the original L1 bridge
 * to the new L1 bridge once all withdrawals that target it are finalized.
 *
 * How to run:
 * 1. Set optimism-integration FRAUD_PROOF_WINDOW_SECONDS to 300 in docker-compose.env.yml
 * 2. Start optimism-integration `./up.sh`
 * 3. Deploy an ovm pair `node publish deploy-ovm-pair`
 * 4. Run the tests: `npm run test:migrate-bridge`
 *
 * Notes:
 * Not intended to be run on CI.
 * This test is based on test:prod:ovm.
 * */
describe('Layer 2 bridge migration tests', () => {
	let SynthetixL1, SynthetixL2;
	let SynthetixBridgeToOptimismL1, SynthetixBridgeToBaseL2;

	let providerL1, providerL2;

	let ownerAddress, ownerL1, ownerL2;

	let watcher;

	// --------------------------
	// Setup
	// --------------------------

	before('set up providers', () => {
		providerL1 = new ethers.providers.JsonRpcProvider('http://localhost:9545');
		providerL2 = new ethers.providers.JsonRpcProvider('http://localhost:8545');
	});

	before('set up signers', () => {
		ownerAddress = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
		const ownerPrivateKey = '0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7';

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

	before('show elapsed time', async () => {
		let elapsed = 0;
		const tick = 60;

		setInterval(() => {
			elapsed += tick;

			console.log(chalk.gray(`${elapsed} seconds`));
		}, tick * 1000);
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
					// TODO

					// -------------------------------
					// Make a new withdrawal
					// -------------------------------

					describe('when a withdrawal is initiated with the new bridges', () => {
						// TODO

						// -------------------------------
						// Original withdrawal finalizes
						// -------------------------------

						describe('when the original withdrawal is finalized', () => {
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

							describe('when the new withdrawal is finalized', () => {
								// TODO

								// -------------------------
								// New withdrawal finalizes
								// -------------------------

								describe('when the new withdrawal is finalized', () => {
									// TODO
								});
							});
						});
					});
				});
			});
		});
	});
});
