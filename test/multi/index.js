const Web3 = require('web3');
const testUtils = require('../utils');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('deploy multiple instances', () => {
	let web3;

	let deployer;

	let loadLocalUsers, isCompileRequired;

	const network = 'local';

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

	before('deploy instance 1', async () => {
		await commands.deploy({
			network,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: './publish/deployed/local',
		});
	});

	before('deploy instance 2', async () => {
		await commands.deploy({
			network,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: './publish/deployed/local-ovm',
		});
	});

	it('dummy', async () => {
		console.log('test here...');
	});
});
