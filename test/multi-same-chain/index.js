const fs = require('fs-extra');

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

const { parseEther, formatEther, parseUnits } = ethers.utils;

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

	let loadLocalUsers, isCompileRequired, fastForward;

	let wallet, provider;

	let messengers;

	let users;

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	const deploymentPaths = [];

	before('set up test utils', async () => {
		({ loadLocalUsers, isCompileRequired, fastForward } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		users = loadLocalUsers();
		deployer = users[0];
		({ wallet, provider } = await setupProvider({
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

	before('tell each deposit contract about the other', async () => {
		for (const i of [0, 1]) {
			const resolver = fetchContract({ contract: 'AddressResolver', instance: i });
			const deposit = fetchContract({ contract: 'SecondaryDeposit', instance: i });
			const depositAlt = fetchContract({ contract: 'SecondaryDeposit', instance: 1 - i });
			await resolver.importAddresses([toBytes32('alt:SecondaryDeposit')], [depositAlt.address]);
			// sync the cache both for this alt and for the ext:Messenger added earlier
			await deposit.setResolverAndSyncCache(resolver.address);
		}
	});

	it('L1 deposit to L2', async () => {
		// take the second predefined user (already loaded with ETH) and give them 1000 SNX on L1
		const user = new ethers.Wallet(users[1].private, provider);
		const synthetix = fetchContract({ contract: 'Synthetix', instance: 0 });
		const synthetixAlt = fetchContract({
			contract: 'Synthetix',
			source: 'MintableSynthetix',
			instance: 1,
		});

		const overrides = {
			gasPrice: parseUnits('5', 'gwei'),
			gasLimit: 1.5e6,
		};

		await synthetix.transfer(user.address, parseEther('1000'), overrides);
		const originalL1Balance = await synthetix.balanceOf(user.address);
		const originalL2Balance = await synthetixAlt.balanceOf(user.address);

		console.log(
			'User has',
			formatEther(originalL1Balance),
			'on L1',
			formatEther(originalL2Balance),
			'on L2'
		);

		const deposit = fetchContract({ contract: 'SecondaryDeposit', instance: 0, user });

		// user must approve SecondaryDeposit to transfer SNX on their behalf
		await fetchContract({ contract: 'Synthetix', instance: 0, user }).approve(
			deposit.address,
			parseEther('100'),
			overrides
		);

		// start the deposit by the user on L1
		await deposit.deposit(parseEther('100'), overrides);

		// wait 100s
		await fastForward(100);

		// wait for message to be relayed
		await waitForCrossDomainMessages(user);

		const newL1Balance = await synthetix.balanceOf(user.address);
		const newL2Balance = await synthetixAlt.balanceOf(user.address);
		console.log('User has', formatEther(newL1Balance), 'on L1', formatEther(newL2Balance), 'on L2');
	});
});
);
