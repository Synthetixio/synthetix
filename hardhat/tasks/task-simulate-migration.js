const isCI = require('is-ci');
const { gray, yellow } = require('chalk');

const ethers = require('ethers');
const { getUsers, getTarget } = require('../..');
const { task } = require('hardhat/config');

const {
	compileInstance,
	prepareDeploy,
	deployInstance,
} = require('../../test/integration/utils/deploy');

const { nominate } = require('../../publish/src/commands/nominate');
const { owner } = require('../../publish/src/commands/owner');

const synthsToAdd = require('../util/synthsToAdd');

task('simulate:migration', 'Simulate a migration on a fork')
	.addFlag('compile', 'Compile the instance to for the latest to generate the migration')
	.addFlag('deploy', 'Deploy the instance with generateSolidity to generate the migration')
	.addParam('release', 'Name of the release')
	.setAction(async (taskArguments, hre) => {
		// create the migration contract by compiling and deploying on a fork
		if (taskArguments.compile) {
			await compileInstance({});
		}
		const network = 'mainnet';

		if (taskArguments.deploy) {
			await prepareDeploy({
				network,
				synthsToAdd,
				useReleases: true,
			});

			await deployInstance({
				addNewSynths: true,
				freshDeploy: false,
				generateSolidity: true,
				providerPort: '8545',
				providerUrl: 'http://localhost',
				network,
				useFork: true,
			});
		}

		// now compile the contract that was invariably created
		await hre.run('compile', { everything: true, optimizer: true });

		// get artifacts via hardhat/ethers
		const Migration = await hre.ethers.getContractFactory(`Migration_${taskArguments.release}`);

		const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
		const ownerAddress = getUsers({ network: 'mainnet', user: 'owner' }).address;

		// but deploy this new migration contract using regular ethers onto the fork (using Migration.deploy won't deploy to the fork as needed)
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
			network,
			throwOnNotNominatedOwner: true,
			useFork: true,
			yes: true,
		});

		// run integration tests on the fork
		const timeout = 600000; // 10m

		hre.config.mocha.timeout = timeout;
		// stop on first error unless we're on CI
		hre.config.mocha.bail = !isCI;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		hre.config.paths.tests = './test/integration/l1/';
		hre.config.fork = true;
		await hre.run('test', taskArguments);
	});
