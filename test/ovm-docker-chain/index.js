const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');
// const axios = require('axios');

const { parseEther } = ethers.utils;

const { assert } = require('../contracts/common');
const testUtils = require('../utils');
const { ensureDeploymentPath, loadAndCheckRequiredSources } = require('../../publish/src/util');

const { wrap, constants } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('deploy', () => {
	let deployer;

	let loadLocalUsers, setupProvider, getContract;

	let wallet;

	let users;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	let currentDeploymentPath;

	before('set up test utils', async () => {
		({ loadLocalUsers, setupProvider, getContract } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		users = loadLocalUsers();
		deployer = users[0];
		({ wallet } = setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: deployer.private,
		}));
	});

	const createTempLocalCopy = ({ prefix }) => {
		const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		fs.copySync(getPathToNetwork({ network: 'goerli', useOvm: true }), folderPath);

		fs.writeFileSync(
			path.join(folderPath, constants.DEPLOYMENT_FILENAME),
			JSON.stringify({ targets: {}, sources: {} }, null, '\t')
		);

		return folderPath;
	};

	const prepareFreshDeployment = (network = 'local', deploymentPath) => {
		ensureDeploymentPath(deploymentPath);
		// get the (local) config file
		const { config, configFile } = loadAndCheckRequiredSources({
			deploymentPath,
			network,
		});
		// switch to true
		Object.keys(config).map(source => {
			config[source] = { deploy: true };
		});
		fs.writeFileSync(configFile, JSON.stringify(config));
	};

	// fetches an array of both instance contracts
	const fetchContract = ({ contract, source = contract, deploymentPath, user }) =>
		getContract({
			contract,
			source,
			network,
			deploymentPath: deploymentPath,
			wallet: user || wallet,
		});

	// before('deploy instance 1', async () => {
	// 	deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-1-local-' }));

	// 	// ensure that only SynthetixBridgeToOptimism is deployed on L1
	// 	switchL2Deployment(network, deploymentPaths[0], true);

	// 	await commands.deploy({
	// 		network,
	// 		freshDeploy: true,
	// 		yes: true,
	// 		privateKey: deployer.private,
	// 		ignoreSafetyChecks: true,
	// 		deploymentPath: deploymentPaths[0],
	// 	});

	// 	// now set the external messenger contract
	// 	const addressResolver = fetchContract({ contract: 'AddressResolver', instance: 0 });
	// 	await addressResolver.importAddresses(
	// 		[toBytes32('ext:Messenger')],
	// 		[messengers.l1CrossDomainMessenger.address]
	// 	);
	// });

	before('deploy an OVM instance', async () => {
		currentDeploymentPath = createTempLocalCopy({ prefix: 'snx-docker-2-local-ovm-' });
		// ensure that we do a fresh deployment
		prepareFreshDeployment(network, currentDeploymentPath, false);
		// complie with the useOVM flag set
		// await commands.build({ showContractSize: true, useOvm: true });

		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			useOvm: true,
			ignoreSafetyChecks: false,
			deploymentPath: currentDeploymentPath,
			methodCallGasLimit: '2500000',
			contractDeploymentGasLimit: '11000000',
			gasPrice: '0',
			ensureOvmDeploymentGasLimit: true,
		});

		// let staticAddresses;
		// await axios.get('http://localhost:8080/addresses.json').then(
		// 	response => {
		// 		staticAddresses = response.data;
		// 	},
		// 	error => {
		// 		console.log(error);
		// 	}
		// );
		// const l2Messenger = staticAddresses['OVM_L2CrossDomainMessenger'];
		// console.log(l2Messenger);
	});

	describe('when all contracts are deployed', () => {
		let synthetixAlt;
		let l2InitialTotalSupply;

		before('when MintableSynthetix is deployed on L2', async () => {
			synthetixAlt = fetchContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				deploymentPath: currentDeploymentPath,
			});

			l2InitialTotalSupply = await synthetixAlt.totalSupply();
		});

		it('the totalSupply on L2 should be right', async () => {
			assert.bnEqual(l2InitialTotalSupply, parseEther('100000000'));
		});
	});
});
