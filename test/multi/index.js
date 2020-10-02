const Web3 = require('web3');
const testUtils = require('../utils');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const { wrap, constants } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('deploy multiple instances', () => {
	let web3;

	let deployer;

	let loadLocalUsers, isCompileRequired;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	before('connect to local chain', async () => {
		const provider = new Web3.providers.HttpProvider('http://127.0.0.1:8545');

		web3 = new Web3(provider);
	});

	before('set up test utils', async () => {
		({ loadLocalUsers, isCompileRequired } = testUtils({ web3 }));
	});

	before('set up user accounts', async () => {
		const users = loadLocalUsers();

		deployer = users[0];
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

	const deploymentPaths = [];

	before('deploy instance 1', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-1-' }));
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: deploymentPaths[0],
		});
	});

	before('deploy instance 2', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-2-' }));
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: deploymentPaths[1],
		});
	});

	// 1. Ensure Deposit is deployed

	// 2. For each instance
	//		- deploy mock cross domain messenger
	//		- connect the cross domain messenger up to each other
	//		- invoke AddressREsolver.importAddresses("ext:Messenger", address)
	// 		- invoke AddressResolver.importAddresses("alt:Deposit", other address)

	it('dummy', async () => {
		console.log('test here...');
	});
});
