const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

const { parseEther, parseUnits } = ethers.utils;

const {
	initCrossDomainMessengers,
	waitForCrossDomainMessages,
} = require('@eth-optimism/ovm-toolchain');

const { assert } = require('../contracts/common');
const testUtils = require('../utils');
const { ensureDeploymentPath, loadAndCheckRequiredSources } = require('../../publish/src/util');

const { wrap, constants, toBytes32 } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('deploy multiple instances', () => {
	let deployer;

	let loadLocalUsers, isCompileRequired, fastForward, setupProvider, getContract;

	let wallet, provider;

	let messengers;

	let users;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	const deploymentPaths = [];

	before('set up test utils', async () => {
		({ loadLocalUsers, isCompileRequired, fastForward, setupProvider, getContract } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		users = loadLocalUsers();
		deployer = users[0];
		({ wallet, provider } = setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: deployer.private,
		}));
	});

	before('compile if needed', async () => {
		if (isCompileRequired()) {
			console.log('Found source file modified after build. Rebuilding...');

			await commands.build({ showContractSize: true, testHelpers: true });
		} else {
			console.log('Skipping build as everything up to date');
		}
	});

	const createTempLocalCopy = ({ prefix }) => {
		const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

		fs.copySync(getPathToNetwork(), folderPath);

		fs.writeFileSync(
			path.join(folderPath, constants.DEPLOYMENT_FILENAME),
			JSON.stringify({ targets: {}, sources: {} }, null, '\t')
		);

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
	const fetchContract = ({ contract, source = contract, instance, user }) =>
		getContract({
			contract,
			source,
			network,
			deploymentPath: deploymentPaths[instance],
			wallet: user || wallet,
		});

	before('deploy cross domain messenger mocks', async () => {
		messengers = await initCrossDomainMessengers(10, 1000, ethers, wallet);
	});

	before('deploy instance 1', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-1-' }));
		// ensure that only SynthetixBridgeToOptimism is deployed on L1
		switchL2Deployment(network, deploymentPaths[0], true);
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: deploymentPaths[0],
		});
		// now set the external messenger contract
		const addressResolver = fetchContract({ contract: 'AddressResolver', instance: 0 });

		await addressResolver.importAddresses(
			[toBytes32('ext:Messenger')],
			[messengers.l1CrossDomainMessenger.address]
		);
	});

	before('deploy instance 2', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-2-' }));
		// ensure that only SynthetixBridgeToBase is deployed on L2
		switchL2Deployment(network, deploymentPaths[1], false);
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			useOvm: true,
			deploymentPath: deploymentPaths[1],
		});
		// now set the external messenger contract
		await fetchContract({ contract: 'AddressResolver', instance: 1 }).importAddresses(
			[toBytes32('ext:Messenger')],
			[messengers.l2CrossDomainMessenger.address]
		);
	});

	before('tell each contract about the other', async () => {
		for (const i of [0, 1]) {
			const resolver = fetchContract({ contract: 'AddressResolver', instance: i });
			let contract;
			let bridgeAlt;
			if (i) {
				contract = fetchContract({ contract: 'SynthetixBridgeToBase', instance: i });
				bridgeAlt = fetchContract({ contract: 'SynthetixBridgeToOptimism', instance: 1 - i });
				await resolver.importAddresses(
					[toBytes32('base:SynthetixBridgeToOptimism')],
					[bridgeAlt.address]
				);
			} else {
				contract = fetchContract({ contract: 'SynthetixBridgeToOptimism', instance: i });
				bridgeAlt = fetchContract({ contract: 'SynthetixBridgeToBase', instance: 1 - i });
				await resolver.importAddresses(
					[toBytes32('ovm:SynthetixBridgeToBase')],
					[bridgeAlt.address]
				);
			}
			// sync the cache both for this alt and for the ext:Messenger added earlier
			await contract.setResolverAndSyncCache(resolver.address);
		}
	});

	describe('when a user has 1000 SNX on L1', () => {
		const overrides = {
			gasPrice: parseUnits('5', 'gwei'),
			gasLimit: 1.5e6,
		};
		let user;
		let synthetix;
		let synthetixAlt;
		let l1ToL2Bridge;

		let l2InitialTotalSupply;

		before('when a user has 1000 SNX on L1', async () => {
			// take the second predefined user (already loaded with ETH) and give them 1000 SNX on L1
			user = new ethers.Wallet(users[1].private, provider);
			synthetix = fetchContract({ contract: 'Synthetix', instance: 0 });
			synthetixAlt = fetchContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				instance: 1,
			});
			l1ToL2Bridge = fetchContract({ contract: 'SynthetixBridgeToOptimism', instance: 0, user });
			await (await synthetix.transfer(user.address, parseEther('1000'), overrides)).wait();
			const originalL1Balance = await synthetix.balanceOf(user.address);
			const originalL2Balance = await synthetixAlt.balanceOf(user.address);

			assert.bnEqual(originalL1Balance, parseEther('1000'));
			assert.bnEqual(originalL2Balance, '0');

			l2InitialTotalSupply = await synthetixAlt.totalSupply();
		});

		before('when the user approves the l1ToL2Bridge contract to spend her SNX', async () => {
			// user must approve SynthetixBridgeToOptimism to transfer SNX on their behalf
			await (
				await fetchContract({ contract: 'Synthetix', instance: 0, user }).approve(
					l1ToL2Bridge.address,
					parseEther('100'),
					overrides
				)
			).wait();
		});

		before('when the user deposits 100 SNX into the bridge contract', async () => {
			// start the deposit by the user on L1
			await (await l1ToL2Bridge.deposit(parseEther('100'), overrides)).wait();
		});

		it('then the deposit contract has 100 SNX', async () => {
			assert.bnEqual(await synthetix.balanceOf(l1ToL2Bridge.address), parseEther('100'));
		});

		it('then the user has 900 SNX on L1', async () => {
			const newL1Balance = await synthetix.balanceOf(user.address);
			assert.bnEqual(newL1Balance, parseEther('900'));
		});

		it('and after a delay, the user has 100 SNX on L2', async () => {
			// wait 100s
			await fastForward(100);

			// wait for message to be relayed
			await waitForCrossDomainMessages(user);

			const newL2Balance = await synthetixAlt.balanceOf(user.address);
			assert.bnEqual(newL2Balance, parseEther('100'));
		});

		it('and the totalSupply on L2 has incremented by 100', async () => {
			assert.bnEqual(await synthetixAlt.totalSupply(), l2InitialTotalSupply.add(parseEther('100')));
		});
	});
});
