const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { toBytes32 } = require('../..');
const { itCanPerformDeposits } = require('./deposits.test');

describe('Layer 2 production tests', () => {
	// --------------------------
	// Setup
	// --------------------------

	let ownerAddress;

	let SynthetixL1, SynthetixL2;

	before('set up providers', () => {
		this.providerL1 = new ethers.providers.JsonRpcProvider('http://localhost:9545');
		this.providerL2 = new ethers.providers.JsonRpcProvider('http://localhost:8545');
	});

	before('set up signers', () => {
		// owner
		// See publish/src/commands/deploy-ovm-pair.js
		ownerAddress = '0x640e7cc27b750144ED08bA09515F3416A988B6a3';
		this.ownerL1 = this.providerL1.getSigner(ownerAddress);
		this.ownerL2 = new ethers.Wallet('0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7', this.providerL2);
	});

	describe('when instances have been deployed in local L1 and L2 chains', () => {
		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: this.providerL1 });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: this.providerL2,
			});
		});

		before('simulate exchange rates and debt cache', async () => {
			async function simulateExchangeRates({ provider, owner }) {
				const Issuer = connectContract({
					contract: 'Issuer',
					provider,
				});
				let ExchangeRates = connectContract({
					contract: 'ExchangeRates',
					provider,
				});
				// let DebtCache = connectContract({
				// 	contract: 'DebtCache',
				// 	provider,
				// });

				let currencyKeys = await Issuer.availableCurrencyKeys();
				currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));
				const additionalKeys = ['ETH'].map(toBytes32); // The Depot uses the key "ETH" as opposed to "sETH" for its ether price
				currencyKeys.push(...additionalKeys);

				const { timestamp } = await provider.getBlock();

				ExchangeRates = ExchangeRates.connect(owner);
				await ExchangeRates.updateRates(
					currencyKeys,
					currencyKeys.map(() => ethers.utils.parseEther('1')),
					timestamp
				);

				// TODO: is this needed?
				// It appears to be needed to be called at least once in the lifetime
				// of a pair of instances, but calling it every time triggers some weird nonce error.
				// DebtCache = DebtCache.connect(owner);
				// await DebtCache.takeDebtSnapshot();
			}

			await simulateExchangeRates({ provider: this.providerL1, owner: this.ownerL1 });
			await simulateExchangeRates({ provider: this.providerL2, owner: this.ownerL2 });
		});

		// --------------------------
		// General properties
		// --------------------------

		describe('general properties', () => {
			it('shows the expected owners', async () => {
				assert.equal(await SynthetixL1.owner(), ownerAddress);
				assert.equal(await SynthetixL2.owner(), ownerAddress);
			});

			it('shows the instances have the expected total supplies', async () => {
				assert.bnEqual(await SynthetixL1.totalSupply(), ethers.utils.parseEther('100000000'));

				assert.bnGte(await SynthetixL2.totalSupply(), ethers.utils.parseEther('0'));
				assert.bnLt(await SynthetixL2.totalSupply(), ethers.utils.parseEther('1000000'));
			});
		});

		// --------------------------
		// Specific properties
		// --------------------------

		itCanPerformDeposits({ ctx: this });

		// TODO
		// itCanPerformWithdrawals();
		// itCanPerformRewardDeposits();
		// itCanMigrateL1Bridges();
	});
});
