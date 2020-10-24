/* eslint-disable */
// TODO: Remove ^

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

const L1CrossDomainMessengerArtifact = require('@eth-optimism/rollup-contracts/build/artifacts/L1CrossDomainMessenger');
const L2CrossDomainMessengerArtifact = require('@eth-optimism/rollup-contracts/build/ovm_artifacts/L2CrossDomainMessenger');
const { wrap, constants, toBytes32 } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('deploy multiple instances', () => {
	let deployer;

	let loadLocalUsers, isCompileRequired, fastForward;

	let l2Provider, l1Provider;
	const wallet = [];
	let messengers;

	let users;

	const l1Url = 'http://127.0.0.1:9545'; // 'https://goerli.infura.io/v3/05ca34e9c9444798b8b0bf9ef32dfdc2'
	const l2Url = 'http://127.0.0.1:8545'; // 'https://uat.optimism.io:8545'

	const l1CrossDomainMessengerAddress = '0x9896260E9B5bDB54182Ad4f0170C26B7a98EC496';
	const l2CrossDomainMessengerAddress = '0xFB319bd2E9A7e3A22234a784C8b24970bbcC2351';

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	const deploymentPaths = [];

	before('set up test utils', async () => {
		({ loadLocalUsers, isCompileRequired, fastForward } = testUtils());
	});

	before('connect to local chain with accounts', async () => {
		users = loadLocalUsers();
		deployer = users[0];
		let l1Wallet, l2Wallet;

		({ l1Wallet, l1Provider } = await setupProvider({
			providerUrl: l1Url,
			privateKey: deployer.private,
		}));
		wallet.push(l1Wallet);

		({ l2Wallet, l2Provider } = await setupProvider({
			providerUrl: l2Url,
			privateKey: deployer.private,
		}));
		wallet.push(l2Wallet);
	});

	before('compile if needed', async () => {
		// if (isCompileRequired()) {
		// OPTIMISM -- Always re-build to avoid accidentally deploying OVM contracts to L1
		console.log('Found source file modified after build. Rebuilding...');

		await commands.build({ showContractSize: true, testHelpers: true });
		// } else {
		// 	console.log('Skipping build as everything up to date');
		// }
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
	const fetchContract = ({ contract, source = contract, instance, user, myWallet }) =>
		getContract({
			contract,
			source,
			network,
			deploymentPath: deploymentPaths[instance],
			wallet: user || myWallet,
		});

	before('deploy cross domain messenger mocks', async () => {
		// messengers = await initCrossDomainMessengers(10, 1000, ethers, wallet);
		messengers = {
			l1CrossDomainMessenger: new ethers.Contract(
				l1CrossDomainMessengerAddress,
				L1CrossDomainMessengerArtifact.abi,
				wallet[0]
			),
			l2CrossDomainMessenger: new ethers.Contract(
				l2CrossDomainMessengerAddress,
				L2CrossDomainMessengerArtifact.abi,
				wallet[1]
			),
		};
	});

	before('deploy instance 1', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-1-' }));

		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			deploymentPath: deploymentPaths[0],
			providerUrl: l1Url,
			gasPrice: '0',
		});
		// now set the external messenger contract
		const addressResolver = fetchContract({
			contract: 'AddressResolver',
			instance: 0,
			user: wallet[0],
		});

		await addressResolver.importAddresses(
			[toBytes32('ext:Messenger')],
			[messengers.l1CrossDomainMessenger.address]
		);
	});

	before('deploy instance 2', async () => {
		deploymentPaths.push(createTempLocalCopy({ prefix: 'snx-multi-2-' }));
		await commands.build({ showContractSize: true, testHelpers: true, useOVM: true });
		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			privateKey: deployer.private,
			useOvm: true,
			deploymentPath: deploymentPaths[1],
			providerUrl: l2Url,
		});
		// now set the external messenger contract
		await fetchContract({
			contract: 'AddressResolver',
			instance: 1,
			user: wallet[1],
		}).importAddresses([toBytes32('ext:Messenger')], [messengers.l2CrossDomainMessenger.address]);
	});

	before('tell each deposit contract about the other', async () => {
		for (const i of [0, 1]) {
			const resolver = fetchContract({
				contract: 'AddressResolver',
				instance: i,
				user: wallet[i],
			});
			const deposit = fetchContract({
				contract: 'SecondaryDeposit',
				instance: i,
				user: wallet[i],
			});
			const depositAlt = fetchContract({
				contract: 'SecondaryDeposit',
				instance: 1 - i,
				user: wallet[i],
			});
			await resolver.importAddresses([toBytes32('alt:SecondaryDeposit')], [depositAlt.address]);
			// sync the cache both for this alt and for the ext:Messenger added earlier
			await deposit.setResolverAndSyncCache(resolver.address);
		}
	});

	it('L1 deposit to L2', async () => {
		// take the second predefined user (already loaded with ETH) and give them 1000 SNX on L1
		const user = new ethers.Wallet(users[1].private, l1Provider);
		const synthetix = fetchContract({ contract: 'Synthetix', instance: 0, user: wallet[0] });
		const synthetixAlt = fetchContract({
			contract: 'Synthetix',
			source: 'MintableSynthetix',
			instance: 1,
			user: wallet[0],
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
		// await fastForward(100);

		// wait for message to be relayed
		// await waitForCrossDomainMessages(user);

		await sleep(60 * 1000); // wait 1 minute

		const newL1Balance = await synthetix.balanceOf(user.address);
		const newL2Balance = await synthetixAlt.balanceOf(user.address);
		console.log('User has', formatEther(newL1Balance), 'on L1', formatEther(newL2Balance), 'on L2');
	});
});
