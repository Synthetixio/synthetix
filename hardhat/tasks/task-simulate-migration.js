const fs = require('fs');
const path = require('path');
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

task(
	'simulate:migration',
	'Simulate a migration on a fork by compiling, deploying and executing it.'
)
	.addFlag(
		'generate',
		'Generate the migration by compiling, preparing and deploying with generateSolidity enabled'
	)
	.addFlag('test', 'Run the integration tests after the migration is executed')
	.addParam('release', 'Name of the release')
	.setAction(async (taskArguments, hre) => {
		const network = 'mainnet';

		console.log(
			gray(`Starting migration forked simulation for release ${yellow(taskArguments.release)}`)
		);

		// create the migration contract by compiling and deploying on a fork
		if (taskArguments.generate) {
			console.log(
				gray(
					`Generate enabled. Compiling, preparing and deploying to generate the migration for ${yellow(
						taskArguments.release
					)}`
				)
			);
			await compileInstance({});

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

		console.log(gray('Now running hardhat compile to flatten and compile the migration contracts'));

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

		// now lookup labels of these contracts (using latest versions so hence pass in the path, not using the cache)
		const targets = getTarget({ network, fs, path });

		const contracts = contractsRequiringOwnership.map(contractAddress => {
			return Object.values(targets).find(({ address }) => address === contractAddress).name;
		});

		console.log(gray(`Nominating contracts required for the migration`));

		await nominate({
			contracts,
			gasPrice: '0',
			network,
			newOwner: migration.address,
			useFork: true,
			yes: true,
		});

		console.log(gray(`Beginning the migration`));

		await migration.migrate(ownerAddress, { gasPrice: '0' });

		console.log(gray(`Migration complete.`));

		console.log(gray(`Running ownership actions to ensure migration relinquished all ownerships.`));

		await owner({
			gasPrice: '0',
			network,
			throwOnNotNominatedOwner: true,
			useFork: true,
			yes: true,
		});

		if (taskArguments.test) {
			console.log(gray(`Running integration tests on the newly migrated fork.`));

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
		}
	});
