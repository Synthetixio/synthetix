const ethers = require('ethers');
const axios = require('axios');
const { Watcher } = require('@eth-optimism/watcher');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { toBytes32 } = require('../..');
const { itCanPerformDeposits } = require('./deposits.test');
const { itCanPerformDepositsTo } = require('./depositsTo.test');
const { itCanPerformRewardDeposits } = require('./rewards.test');
const { itCanPerformWithdrawals } = require('./withdrawals.test');
const { itCanPerformWithdrawalsTo } = require('./withdrawalsTo.test');
const { itCanPerformEscrowMigration } = require('./migrateEscrow.test');
const { itCanPerformDepositAndEscrowMigration } = require('./depositAndMigrateEscrow.test');
const { itCanPerformSynthExchange } = require('./synthExchange.test');

/*
 * ===== L2 GOTCHAS =====
 * Please make sure to read this before you work with these tests. It will save you time!
 *
 * 1) No fast forward, snapshots, or other rpc methods of that sort
 * 2) Revert reasons are harder to get on L2. See 'utils/revertOptimism'
 * 3) The underlying local chains allow txs to be mined with gasPrice = 0
 * 4) Atm, "now" in L2 contracts is always zero
 * 5) The L2 local chain is created with no accounts
 * */

describe('Layer 2 production tests', () => {
	let SynthetixL1, SynthetixL2;

	// --------------------------
	// Setup
	// --------------------------

	before('set up providers', () => {
		this.providerL1 = new ethers.providers.JsonRpcProvider('http://localhost:9545');
		this.providerL2 = new ethers.providers.JsonRpcProvider('http://localhost:8545');

		this.providerL2.getGasPrice = () => ethers.BigNumber.from('0');
	});

	before('set up signers', () => {
		// See publish/src/commands/deploy-ovm-pair.js
		this.ownerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
		this.ownerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
		this.user1Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
		this.user1PrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

		// These are set up in L1 but not in L2,
		// that's why we get signers in L1, and create signers in L2.
		// Also note that L2 doesn't use Ether, so we can just create signers
		// and it doesn't matter if they don't have Ether.
		this.ownerL1 = this.providerL1.getSigner(this.ownerAddress);
		this.ownerL2 = new ethers.Wallet(this.ownerPrivateKey, this.providerL2);
	});

	before('set up watchers', async () => {
		const response = await axios.get('http://localhost:8080/addresses.json');
		const addresses = response.data;

		this.watcher = new Watcher({
			l1: {
				provider: this.providerL1,
				messengerAddress: addresses['Proxy__OVM_L1CrossDomainMessenger'],
			},
			l2: {
				provider: this.providerL2,
				messengerAddress: '0x4200000000000000000000000000000000000007',
			},
		});
	});

	// after('exit', async () => {
	// 	// TODO: Optimism watchers leave the process open, so we explicitely kill it
	// 	process.exit(0);
	// });

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
				provider: this.providerL1,
				owner: this.ownerL1,
				useOvm: false,
			});
			await simulateExchangeRates({ provider: this.providerL2, owner: this.ownerL2, useOvm: true });
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

			await tweakSettings({ provider: this.providerL1, owner: this.ownerL1, useOvm: false });
			await tweakSettings({ provider: this.providerL2, owner: this.ownerL2, useOvm: true });
		});

		// // --------------------------
		// // General properties
		// // --------------------------

		describe('[GENERAL] properties', () => {
			it('shows the expected owners', async () => {
				assert.equal(await SynthetixL1.owner(), this.ownerAddress);
				assert.equal(await SynthetixL2.owner(), this.ownerAddress);
			});

			it('shows the instances have the expected total supplies', async () => {
				assert.bnGte(await SynthetixL1.totalSupply(), ethers.utils.parseEther('0'));
				assert.bnGte(await SynthetixL2.totalSupply(), ethers.utils.parseEther('0'));
			});
		});

		// --------------------------
		// Specific properties
		// --------------------------

		itCanPerformDeposits({ ctx: this });
		itCanPerformDepositsTo({ ctx: this });
		itCanPerformWithdrawals({ ctx: this });
		itCanPerformWithdrawalsTo({ ctx: this });
		itCanPerformRewardDeposits({ ctx: this });
		itCanPerformEscrowMigration({ ctx: this });
		itCanPerformDepositAndEscrowMigration({ ctx: this });
		itCanPerformSynthExchange({ ctx: this });
	});
});
