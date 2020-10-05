const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

const {
	initCrossDomainMessengers,
	waitForCrossDomainMessages,
} = require('@eth-optimism/ovm-toolchain');

const testUtils = require('../utils');
const { getContract, setupProvider } = require('../../scripts/utils');

const { wrap, constants, toBytes32 } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('deploy multiple instances', () => {
	let deployer;

	let loadLocalUsers, isCompileRequired;

	let provider, wallet;

	let messengers;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	const deploymentPaths = [];

	before('set up test utils', async () => {
		({ loadLocalUsers, isCompileRequired } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		const users = loadLocalUsers();
		deployer = users[0];
		const setup = await setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: deployer.private,
		});
		provider = setup.provider;
		wallet = setup.wallet;
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

	// fetches an array of both instance contracts
	const fetchContract = ({ contract, source = contract }) => {
		return [0, 1].map(i =>
			getContract({ contract, source, network, deploymentPath: deploymentPaths[i], wallet })
		);
	};

	before('deploy cross domain messenger mocks', async () => {
		messengers = await initCrossDomainMessengers(10, 1000, ethers, wallet);
	});

	before('deploy instance 1', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-1-' }));
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: deploymentPaths[0],
		});
		// now set the external messenger contract
		await fetchContract({ contract: 'AddressResolver' })[0].importAddresses(
			[toBytes32('ext:Messenger')],
			[messengers.l1CrossDomainMessenger.address]
		);
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
		// now set the external messenger contract
		await fetchContract({ contract: 'AddressResolver' })[1].importAddresses(
			[toBytes32('ext:Messenger')],
			[messengers.l2CrossDomainMessenger.address]
		);
	});

	before('tell each deposit contract about the other', async () => {
		for (const i of [0, 1]) {
			await fetchContract({ contract: 'AddressResolver' })[i].importAddresses(
				[toBytes32('alt:SecondaryDeposit')],
				[fetchContract({ contract: 'SecondaryDeposit' })[1 - i].address]
			);
		}
	});

	it('dummy', async () => {
		console.log('test here...');
	});
});
