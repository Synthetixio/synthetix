const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

const { parseEther, parseUnits } = ethers.utils;

const { assert } = require('../contracts/common');
const testUtils = require('../utils');
const { ensureDeploymentPath, loadAndCheckRequiredSources } = require('../../publish/src/util');
const { wrap, constants, toBytes32 } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

async function simulateExchangeRates(provider, exchangeRates, issuer) {
	let currencyKeys = await issuer.availableCurrencyKeys();
	currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));
	const additionalKeys = ['ETH'].map(toBytes32); // The Depot uses the key "ETH" as opposed to "sETH" for its ether price
	currencyKeys.push(...additionalKeys);

	const now = (await provider.getBlock(provider.getBlockNumber())).timestamp;

	await exchangeRates.updateRates(
		currencyKeys,
		currencyKeys.map(() => parseEther('1')),
		now
	);
}

describe('deploy an OVM instance', () => {
	let deployer;

	let loadLocalUsers, setupProvider, getContract;

	let wallet, provider;

	let users;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	let deploymentPath;

	before('set up test utils', async () => {
		({ loadLocalUsers, setupProvider, getContract } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		users = loadLocalUsers();
		deployer = users[0];
		({ wallet, provider } = setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: deployer.private,
		}));
	});

	const createTempLocalCopy = ({ prefix }) => {
		const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

		fs.copySync(getPathToNetwork(), folderPath);

		fs.writeFileSync(
			path.join(folderPath, constants.DEPLOYMENT_FILENAME),
			JSON.stringify({ targets: {}, sources: {} }, null, '\t')
		);

		// fs.writeFileSync(
		// 	path.join(folderPath, constants.SYNTHS_FILENAME),
		// 	JSON.stringify([{ name: 'sUSD', asset: 'USD' }], null, '\t')
		// );

		return folderPath;
	};

	const switchL2Deployment = (network = 'local', deploymentPath, deployL1ToL2Bridge) => {
		ensureDeploymentPath(deploymentPath);
		// get the (local) config file
		const { config, configFile } = loadAndCheckRequiredSources({
			deploymentPath,
			network,
		});
		// adjust deployment indicators and update config file
		if (deployL1ToL2Bridge) {
			delete config['SynthetixBridgeToBase'];
			config['SynthetixBridgeToOptimism'] = { deploy: true };
		} else {
			delete config['SynthetixBridgeToOptimism'];
			config['SynthetixBridgeToBase'] = { deploy: true };
		}

		fs.writeFileSync(configFile, JSON.stringify(config));
	};

	// fetches an array of both instance contracts
	const fetchContract = ({ contract, source = contract, user }) =>
		getContract({
			contract,
			source,
			network,
			deploymentPath: deploymentPath,
			wallet: user || wallet,
		});

	before('compile contracts', async () => {
		// Note: Will use regular compilation for both instances
		// since they will be run in a regular local chain.
		await commands.build({ showContractSize: true, testHelpers: true });
	});

	before('deploy instance', async () => {
		deploymentPath = createTempLocalCopy({ prefix: 'ovm-mock-chain' });

		// ensure that only SynthetixBridgeToBase is deployed on L2
		switchL2Deployment(network, deploymentPath, false);

		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			useOvm: true,
			ignoreSafetyChecks: true,
			deploymentPath: deploymentPath,
		});
	});

	describe('when a user has 1000 SNX', () => {
		const overrides = {
			gasPrice: parseUnits('5', 'gwei'),
			gasLimit: 1.5e6,
		};
		let user;
		let mintableSynthetix;

		before('when a user has 1000 SNX', async () => {
			user = new ethers.Wallet(users[1].private, provider);
			mintableSynthetix = fetchContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
			});
			await (await mintableSynthetix.transfer(user.address, parseEther('1000'), overrides)).wait();
			const originalL2Balance = await mintableSynthetix.balanceOf(user.address);

			assert.bnEqual(originalL2Balance, parseEther('1000'));
		});

		it('then the user has 1000 SNX', async () => {
			const newBalance = await mintableSynthetix.balanceOf(user.address);
			assert.bnEqual(newBalance, parseEther('1000'));
		});

		describe('when the user tries to issue synths', () => {
			let exchangeRates;
			let issuer;
			before('update rates', async () => {
				exchangeRates = fetchContract({
					contract: 'ExchangeRates',
					deployer,
				});
				issuer = fetchContract({
					contract: 'Issuer',
					deployer,
				});
				await simulateExchangeRates(provider, exchangeRates, issuer);
			});

			before('issue Synths', async () => {
				mintableSynthetix = fetchContract({
					contract: 'Synthetix',
					source: 'MintableSynthetix',
					user,
				});
				await mintableSynthetix.issueMaxSynths(overrides);
			});

			it('then the user must have some sUSD', async () => {
				const sUSD = fetchContract({
					contract: 'SynthsUSD',
					source: 'ProxyERC20',
					user,
				});
				const sUsdBalance = await sUSD.balanceOf(user.address);
				assert.bnNotEqual(sUsdBalance, 0);
			});
		});
	});
});
