const { gray, yellow } = require('chalk');
const { task } = require('hardhat/config');
const execa = require('execa');

task('ops', 'Run Optimism chain')
	.addFlag('clear', 'Clean up docker and get a fresh clone of the optimism repository')
	.addFlag('build', 'Get the right commit and builds the repository')
	.addFlag('buildOps', 'Build fresh docker images for the chain')
	.addFlag('start', 'Start the latest build')
	.addFlag('stop', 'Deploy an l1 instance before running the tests')
	.addOptionalParam('optimismPath', 'Path to optmism repository folder', '~/optimism')
	.addOptionalParam(
		'optimismCommit',
		'Commit to checkout',
		'86708bb5758cd2b647b3ca2be698beb5aa3af81f'
	)
	.setAction(async (taskArguments, hre, runSuper) => {
		const opsPath = taskArguments.optimismPath;
		const opsCommit = taskArguments.optimismCommit;

		if (taskArguments.clear) {
			// clear
			console.log(yellow('clearing all'));
			console.log(gray('  stop if still running'));
			await execa('sh', ['-c', `cd ${opsPath}/ops && docker-compose down -v`]);
			console.log(gray('  prune docker'));
			await execa('docker', ['system', 'prune', '-f']);
			console.log(gray('  clone fresh repository into', opsPath));
			await execa('sh', ['-c', 'rm -drf ' + opsPath]);
			await execa('sh', [
				'-c',
				'git clone https://github.com/ethereum-optimism/optimism.git ' + opsPath,
			]);
			// docker system prune -f && rm -rf ${OPT_PATH:-~/optimism} && mkdir -p  ${OPT_PATH:-~/optimism} && cd ${OPT_PATH:-~/optimism} && git clone https://github.com/ethereum-optimism/optimism.git .
		}
		if (taskArguments.build || (taskArguments.clear && taskArguments.start)) {
			// build
			console.log(yellow('building'));
			console.log(gray('  checkout commit:', opsCommit));
			await execa('sh', ['-c', `cd ${opsPath} && git fetch `]);
			await execa('sh', ['-c', `cd ${opsPath} && git checkout master `]);
			await execa('sh', ['-c', `cd ${opsPath} && git pull origin master `]);
			await execa('sh', ['-c', `cd ${opsPath} && git checkout ${opsCommit}`]);
			console.log(gray('  get dependencies'));
			await execa('sh', ['-c', `cd ${opsPath} && yarn `]);
			console.log(gray('  build'));
			await execa('sh', ['-c', `cd ${opsPath} && yarn build `]);
			// cd ${OPT_PATH:-~/optimism} && git fetch && git checkout master && git pull origin master && git checkout ${OPT_COMMIT:-86708bb5758cd2b647b3ca2be698beb5aa3af81f} && yarn && yarn build
		}
		if (taskArguments.buildOps || (taskArguments.clear && taskArguments.start)) {
			// buildOps
			console.log(yellow('building docker images'));
			await execa('sh', [
				'-c',
				`cd ${opsPath}/ops && export COMPOSE_DOCKER_CLI_BUILD=1 && export DOCKER_BUILDKIT=1 && docker-compose build`,
			]);

			// cd ${OPT_PATH:-~/optimism}/ops && export COMPOSE_DOCKER_CLI_BUILD=1 && export DOCKER_BUILDKIT=1 && docker-compose build
		}
		if (taskArguments.start) {
			// start
			console.log(yellow('starting'));
			await execa('sh', ['-c', `cd ${opsPath}/ops && docker-compose up -d`]);
			// cd ${OPT_PATH:-~/optimism}/ops && docker-compose up
		}
		if (taskArguments.stop) {
			// stop
			console.log(yellow('stoping'));
			await execa('sh', ['-c', `cd ${opsPath}/ops && docker-compose down -v`]);
			// cd ${OPT_PATH:-~/optimism}/ops && docker-compose down -v
		}
	});
