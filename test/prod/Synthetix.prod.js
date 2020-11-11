const { grey, red } = require('chalk');
const { web3, contract, artifacts, config } = require('@nomiclabs/buidler');
const fs = require('fs');
const path = require('path');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit, fromUnit } = require('../utils')();
const { wrap, toBytes32 } = require('../..');
const {
	detectNetworkName,
	connectContracts,
	connectContract,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	skipWaitingPeriod,
	skipStakeTime,
	writeSetting,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	implementsVirtualSynths,
} = require('./utils');

const gasFromReceipt = ({ receipt }) =>
	receipt.gasUsed > 1e6 ? receipt.gasUsed / 1e6 + 'm' : receipt.gasUsed / 1e3 + 'k';

contract('Synthetix (prod tests)', accounts => {
	const [, user1, user2] = accounts;

	let owner;

	let network, deploymentPath;

	let Synthetix, SynthetixState, ReadProxyAddressResolver;
	let SynthsUSD, SynthsETH;

	before('prepare', async () => {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		owner = getUsers({ network, user: 'owner' }).address;

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await takeDebtSnapshot({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({
			Synthetix,
			SynthetixState,
			SynthsUSD,
			SynthsETH,
			ReadProxyAddressResolver,
		} = await connectContracts({
			network,
			deploymentPath,
			requests: [
				{ contractName: 'Synthetix' },
				{ contractName: 'SynthetixState' },
				{ contractName: 'ProxyERC20sUSD', abiName: 'Synth', alias: 'SynthsUSD' },
				{ contractName: 'ProxysETH', abiName: 'Synth', alias: 'SynthsETH' },
				{ contractName: 'ReadProxyAddressResolver' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		await skipWaitingPeriod({ network, deploymentPath });

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			network,
			deploymentPath,
		});
		await ensureAccountHassUSD({
			amount: toUnit('100'),
			account: user1,
			network,
			deploymentPath,
		});
		await ensureAccountHasSNX({
			amount: toUnit('100'),
			account: user1,
			network,
			deploymentPath,
		});
	});

	describe('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await Synthetix.resolver(), ReadProxyAddressResolver.address);
		});

		it('has the expected owner set', async () => {
			assert.equal(await Synthetix.owner(), owner);
		});

		it('does not report any rate to be stale or invalid', async () => {
			assert.isFalse(await Synthetix.anySynthOrSNXRateIsInvalid());
		});

		it('reports matching totalIssuedSynths and debtLedger', async () => {
			const totalIssuedSynths = await Synthetix.totalIssuedSynths(toBytes32('sUSD'));
			const debtLedgerLength = await SynthetixState.debtLedgerLength();

			assert.isFalse(debtLedgerLength > 0 && totalIssuedSynths === 0);
		});
	});

	describe('erc20 functionality', () => {
		addSnapshotBeforeRestoreAfter();

		it('can transfer SNX', async () => {
			const user1BalanceBefore = await Synthetix.balanceOf(user1);
			const user2BalanceBefore = await Synthetix.balanceOf(user2);

			const amount = toUnit('10');
			await Synthetix.transfer(user2, amount, {
				from: user1,
			});

			const user1BalanceAfter = await Synthetix.balanceOf(user1);
			const user2BalanceAfter = await Synthetix.balanceOf(user2);

			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.sub(amount));
			assert.bnEqual(user2BalanceAfter, user2BalanceBefore.add(amount));
		});
	});

	describe('minting', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await writeSetting({
				setting: 'setMinimumStakeTime',
				value: '60',
				owner,
				network,
				deploymentPath,
			});
		});

		it('can issue sUSD', async () => {
			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			const amount = toUnit('10');
			await Synthetix.issueSynths(amount, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.add(amount));
		});

		it('can burn sUSD', async () => {
			await skipStakeTime({ network, deploymentPath });

			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			await Synthetix.burnSynths(user1BalanceBefore, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnLt(user1BalanceAfter, user1BalanceBefore);
		});
	});

	describe('exchanging', () => {
		addSnapshotBeforeRestoreAfter();

		it('can exchange sUSD to sETH', async () => {
			await skipWaitingPeriod({ network, deploymentPath });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			const amount = toUnit('10');
			await Synthetix.exchange(toBytes32('sUSD'), amount, toBytes32('sETH'), {
				from: user1,
			});

			const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			assert.bnLt(user1BalanceAftersUSD, user1BalanceBeforesUSD);
			assert.bnGt(user1BalanceAftersETH, user1BalanceBeforesETH);
		});

		it('can exchange sETH to sUSD', async () => {
			await skipWaitingPeriod({ network, deploymentPath });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			const amount = toUnit('1');
			await Synthetix.exchange(toBytes32('sETH'), amount, toBytes32('sUSD'), {
				from: user1,
			});

			const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			assert.bnLt(user1BalanceAftersETH, user1BalanceBeforesETH);
			assert.bnGt(user1BalanceAftersUSD, user1BalanceBeforesUSD);
		});
	});

	describe('exchanging with virtual synths', () => {
		let Exchanger;
		let vSynth;

		before('skip if there is no vSynth implementation', async function() {
			const virtualSynths = await implementsVirtualSynths({ network, deploymentPath });
			if (config.useOvm || !virtualSynths) {
				this.skip();
			}
		});

		before(async () => {
			await skipWaitingPeriod({ network, deploymentPath });

			Exchanger = await connectContract({
				network,
				deploymentPath,
				contractName: 'Exchanger',
			});

			// // clear out any pending settlements
			await Exchanger.settle(user1, toBytes32('sETH'), { from: user1 });
			await Exchanger.settle(user1, toBytes32('sBTC'), { from: user1 });
		});

		describe('with virtual synths', () => {
			it('can exchange sUSD to sETH using a Virtual Synth', async () => {
				const amount = toUnit('1');
				const txn = await Synthetix.exchangeWithVirtual(
					toBytes32('sUSD'),
					amount,
					toBytes32('sETH'),
					{
						from: user1,
					}
				);

				const receipt = await web3.eth.getTransactionReceipt(txn.tx);

				console.log('Gas on exchange', gasFromReceipt({ receipt }));

				const vSynthCreationEvent = Exchanger.abi.find(
					({ name }) => name === 'VirtualSynthCreated'
				);

				const log = txn.receipt.rawLogs.find(
					({ topics }) => topics[0] === vSynthCreationEvent.signature
				);

				const decoded = web3.eth.abi.decodeLog(vSynthCreationEvent.inputs, log.data, log.topics);

				console.log('vSynth addy', decoded.vSynth);

				vSynth = await artifacts.require('VirtualSynth').at(decoded.vSynth);

				console.log('vSynth name', await vSynth.name());
				console.log('vSynth symbol', await vSynth.symbol());
				console.log('vSynth total supply', fromUnit(await vSynth.totalSupply()));
				console.log('vSynth balance of user1', fromUnit(await vSynth.balanceOf(user1)));
			});

			it('can be settled into the synth after the waiting period expires', async () => {
				await skipWaitingPeriod({ network, deploymentPath });

				const txn = await vSynth.settle(user1, { from: user1 });

				const receipt = await web3.eth.getTransactionReceipt(txn.tx);

				console.log('Gas on vSynth settlement', gasFromReceipt({ receipt }));

				const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

				console.log('user1 has sETH:', fromUnit(user1BalanceAftersETH));
			});
		});

		describe('with virtual tokens and a custom swap contract', () => {
			const usdcHolder = '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8';
			const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
			const wbtc = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';

			before('skip if not on mainnet', async function() {
				if (network !== 'mainnet') {
					this.skip();
				}
			});

			it('using virtual tokens', async () => {
				// deploy SwapWithVirtualSynth
				const swapContract = await artifacts.require('SwapWithVirtualSynth').new();

				console.log('\n\n✅ Deploy SwapWithVirtualSynth at', swapContract.address);

				const WBTC = await artifacts.require('ERC20').at(wbtc);
				const originalWBTCBalance = (await WBTC.balanceOf(usdcHolder)).toString() / 1e8;

				// USDC uses 6 decimals
				const amount = ('10000000' * 1e6).toString();

				const USDC = await artifacts.require('ERC20').at(usdc);

				console.log(
					grey(
						'USDC balance of powned account',
						(await USDC.balanceOf(usdcHolder)).toString() / 1e6
					)
				);

				await USDC.approve(swapContract.address, amount, { from: usdcHolder });

				console.log('✅ User approved swap contract to spend their USDC');

				const txn = await swapContract.usdcToWBTC(amount, { from: usdcHolder });
				const receipt = await web3.eth.getTransactionReceipt(txn.tx);

				console.log(
					'✅ User invokes swap.usdbToWBTC with 10m USDC',
					'Gas',
					red(gasFromReceipt({ receipt }))
				);

				const vSynthCreationEvent = Exchanger.abi.find(
					({ name }) => name === 'VirtualSynthCreated'
				);

				const log = txn.receipt.rawLogs.find(
					({ topics }) => topics[0] === vSynthCreationEvent.signature
				);

				const decoded = web3.eth.abi.decodeLog(vSynthCreationEvent.inputs, log.data, log.topics);

				const SynthsBTC = await connectContract({
					network,
					contractName: 'ProxysBTC',
					abiName: 'Synth',
					alias: 'SynthsBTC',
				});

				vSynth = await artifacts.require('VirtualSynth').at(decoded.vSynth);

				console.log(
					grey(
						await vSynth.name(),
						await vSynth.symbol(),
						decoded.vSynth,
						fromUnit(await vSynth.totalSupply())
					)
				);

				const { vToken: vTokenAddress } = txn.logs[0].args;
				const vToken = await artifacts.require('VirtualToken').at(vTokenAddress);

				console.log(
					grey(
						await vToken.name(),
						await vToken.symbol(),
						vTokenAddress,
						fromUnit(await vToken.totalSupply())
					)
				);

				console.log(
					grey('\t⏩ vSynth.balanceOf(vToken)', fromUnit(await vSynth.balanceOf(vTokenAddress)))
				);

				console.log(
					grey('\t⏩ sBTC.balanceOf(vSynth)', fromUnit(await SynthsBTC.balanceOf(decoded.vSynth)))
				);

				console.log(
					grey('\t⏩ vToken.balanceOf(user)', fromUnit(await vToken.balanceOf(usdcHolder)))
				);

				await skipWaitingPeriod({ network });
				console.log(grey('⏰  Synth waiting period expires'));

				const settleTxn = await vToken.settle(usdcHolder);

				const settleReceipt = await web3.eth.getTransactionReceipt(settleTxn.tx);

				console.log(
					'✅ Anyone invokes vToken.settle(user)',
					'Gas',
					red(gasFromReceipt({ receipt: settleReceipt }))
				);

				console.log(
					grey('\t⏩ sBTC.balanceOf(vSynth)', fromUnit(await SynthsBTC.balanceOf(decoded.vSynth)))
				);
				console.log(
					grey('\t⏩ sBTC.balanceOf(vToken)', fromUnit(await SynthsBTC.balanceOf(vTokenAddress)))
				);

				console.log(
					grey('\t⏩ vToken.balanceOf(user)', fromUnit(await vToken.balanceOf(usdcHolder)))
				);

				console.log(
					grey(
						'\t⏩ WBTC.balanceOf(vToken)',
						(await WBTC.balanceOf(vTokenAddress)).toString() / 1e8
					)
				);

				console.log(
					grey(
						'\t⏩ WBTC.balanceOf(user)',
						(await WBTC.balanceOf(usdcHolder)).toString() / 1e8 - originalWBTCBalance
					)
				);

				// output log of settlement txn if need be
				// require('fs').writeFileSync(
				// 	'prod-run.log',
				// 	require('util').inspect(settleTxn, false, null, true)
				// );
			});
		});
	});
});
