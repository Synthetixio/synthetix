const isCI = require('is-ci');
const { gray, yellow } = require('chalk');

const ethers = require('ethers');
const { getUsers, getTarget } = require('../..');
const { task } = require('hardhat/config');

const { nominate } = require('../../publish/src/commands/nominate');
const { owner } = require('../../publish/src/commands/owner');

task('simulate:migration', 'Simulate a migration on a fork')
	.addParam('release', 'name of the release')
	.setAction(async (taskArguments, hre) => {
		const timeout = 600000; // 10m

		hre.config.mocha.timeout = timeout;
		// stop on first error unless we're on CI
		hre.config.mocha.bail = !isCI;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		hre.config.paths.tests = './test/integration/l1/';
		hre.config.fork = true;

		const network = 'mainnet';
		// hre.config.providerUrl = 'http://localhost:8545';
		// const useOvm = false;
		// const buildPath = path.join(__dirname, '..', '..', BUILD_FOLDER);

		await hre.run('compile', { everything: true, optimizer: true });

		// get artifacts via hardhat/ethers
		const Migration = await hre.ethers.getContractFactory(`Migration_${taskArguments.release}`);

		const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
		const ownerAddress = getUsers({ network: 'mainnet', user: 'owner' }).address;

		// but deploy using regular ethers onto the fork (using Migration.deploy won't deploy to the fork as needed)
		const Factory = new ethers.ContractFactory(
			Migration.interface,
			Migration.bytecode,
			provider.getSigner(getUsers({ network: 'mainnet', user: 'deployer' }).address)
		);

		const migration = await Factory.deploy({ gasPrice: ethers.utils.parseUnits('0') });

		await migration.deployTransaction.wait();

		console.log(gray(`Deployed ${taskArguments.release} release to ${yellow(migration.address)}`));

		const contractsRequiringOwnership = await migration.contractsRequiringOwnership();

		// now lookup labels of these contracts
		const targets = getTarget({ network });

		const contracts = contractsRequiringOwnership.map(contractAddress => {
			return Object.values(targets).find(({ address }) => address === contractAddress).name;
		});

		await nominate({
			contracts,
			gasPrice: '0',
			network,
			newOwner: migration.address,
			useFork: true,
			yes: true,
		});

		await migration.migrate(ownerAddress, { gasPrice: '0' });

		await owner({
			gasPrice: '0',
			useFork: true,
			yes: true,
		});

		// run integration tests on the fork

		// await hre.run('test', taskArguments);
	});
