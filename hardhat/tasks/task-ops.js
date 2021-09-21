const fs = require('fs');
const { homedir } = require('os');
const { gray, yellow } = require('chalk');
const { task } = require('hardhat/config');
const { spawn } = require('child_process');
const execa = require('execa');
const OPS_PROCESSES = [
	{ service: 'batch_submitter', image: 'ethereumoptimism/batch-submitter' },
	{ service: 'deployer', image: 'ethereumoptimism/deployer' },
	{ service: 'dtl', image: 'ethereumoptimism/data-transport-layer' },
	{ service: 'l1_chain', image: 'ethereumoptimism/hardhat' },
	{ service: 'l2geth', image: 'ethereumoptimism/l2geth' },
	{ service: 'relayer', image: 'ethereumoptimism/message-relayer' },
];

task('ops', 'Run Optimism chain')
	.addFlag('fresh', 'Clean up docker and get a fresh clone of the optimism repository')
	.addFlag('build', 'Get the right commit and builds the repository')
	.addFlag('buildOps', 'Build fresh docker images for the chain')
	.addFlag('start', 'Start the latest build')
	.addFlag('stop', 'Stop optimism chain')
	.addFlag('detached', 'Detach the chain from the console')
	.addOptionalParam('optimismPath', 'Path to optmism repository folder', './optimism')
	.addOptionalParam('optimismBranch', 'Branch to checkout', 'develop')
	.addOptionalParam(
		'optimismCommit',
		'Commit to checkout',
		'349279289076dd250e188f863d0b656088e57afd'
	)
	.setAction(async (taskArguments, hre, runSuper) => {
		taskArguments.maxMemory = true;

		const opsPath = taskArguments.optimismPath.replace('~', homedir);
		const opsBranch = taskArguments.optimismBranch;
		const opsCommit = taskArguments.optimismCommit;
		const opsDetached = taskArguments.detached ? '-d' : '';

		console.log(gray('optimism branch:', opsBranch));
		console.log(gray('optimism commit:', opsCommit));
		console.log(gray('optimism folder:', opsPath));

		if (taskArguments.stop) {
			console.log(yellow('stoping'));
			if (fs.existsSync(opsPath)) {
				_stop({ opsPath });
			}
			return;
		}

		if (taskArguments.fresh) {
			console.log(yellow('clearing and getting a fresh clone'));
			if (fs.existsSync(opsPath) && _isRunning({ opsPath })) {
				_stop({ opsPath });
			}
			_fresh({ opsPath });
		}

		if (taskArguments.build || (taskArguments.fresh && taskArguments.start)) {
			console.log(yellow('building'));
			if (!fs.existsSync(opsPath)) {
				_fresh({ opsPath });
			}

			_build({ opsPath, opsCommit, opsBranch });
		}

		if (taskArguments.buildOps || (taskArguments.fresh && taskArguments.start)) {
			console.log(yellow('building ops'));
			if (!fs.existsSync(opsPath)) {
				_fresh({ opsPath });
				_build({ opsPath, opsCommit, opsBranch });
			}
			_buildOps({ opsPath });
		}

		if (taskArguments.start) {
			console.log(yellow('starting'));
			if (fs.existsSync(opsPath) && _isRunning({ opsPath })) {
				console.log(yellow('already running'));
				return;
			}

			if (!fs.existsSync(opsPath)) {
				_fresh({ opsPath });
				_build({ opsPath, opsCommit, opsBranch });
				_buildOps({ opsPath });
			} else if (!_imagesExist()) {
				_build({ opsPath, opsCommit, opsBranch });
				_buildOps({ opsPath });
			}
			await _start({ opsPath, opsDetached });
		}
	});

function _isRunning({ opsPath }) {
	console.log(gray('  check if services are running'));
	let result = true;

	const images = execa.sync('sh', ['-c', `cd ${opsPath}/ops && docker ps -q --no-trunc `]);
	if (images.stdout === '') {
		return false;
	}

	OPS_PROCESSES.forEach(item => {
		try {
			const imageId = execa.sync('sh', [
				'-c',
				`cd ${opsPath}/ops && docker ps -q --no-trunc | grep $(docker-compose ps -q ${item.service} )`,
			]);
			if (imageId.stdout === '') {
				result = false;
			}
		} catch (err) {
			if (err.exitCode) {
				result = false;
			}
		}
	});
	return result;
}

function _imagesExist() {
	console.log(gray('  check if images exists'));
	let result = true;

	OPS_PROCESSES.forEach(item => {
		const imageId = execa.sync('sh', ['-c', `docker image ls ${item.image} -q`]);
		if (imageId.stdout === '') {
			result = false;
		}
	});
	return result;
}

function _fresh({ opsPath }) {
	console.log(gray('  clone fresh repository into', opsPath));
	execa.sync('sh', ['-c', 'rm -drf ' + opsPath]);
	execa.sync('sh', [
		'-c',
		'git clone https://github.com/ethereum-optimism/optimism.git ' + opsPath,
	]);
}

function _build({ opsPath, opsCommit, opsBranch }) {
	console.log(gray('  checkout commit:', opsCommit));
	execa.sync('sh', ['-c', `cd ${opsPath} && git fetch `]);
	execa.sync('sh', ['-c', `cd ${opsPath} && git checkout ${opsBranch} `]);
	execa.sync('sh', ['-c', `cd ${opsPath} && git pull origin ${opsBranch} `]);
	if (opsCommit) {
		execa.sync('sh', ['-c', `cd ${opsPath} && git checkout ${opsCommit}`]);
	}
	console.log(gray('  get dependencies'));
	execa.sync('sh', ['-c', `cd ${opsPath} && yarn `]);
	console.log(gray('  build'));
	execa.sync('sh', ['-c', `cd ${opsPath} && yarn build `]);
}

function _buildOps({ opsPath }) {
	console.log(gray('  build ops images'));
	execa.sync('sh', [
		'-c',
		`cd ${opsPath}/ops && export COMPOSE_DOCKER_CLI_BUILD=1 && export DOCKER_BUILDKIT=1 && docker-compose build`,
	]);
}

async function _start({ opsPath, opsDetached }) {
	console.log(gray('  start ops'));
	spawn('sh', ['-c', `cd ${opsPath}/ops && docker-compose up ${opsDetached}`], {
		stdio: 'inherit',
	});
	await new Promise(() => {}); // Keeps the process open
}

function _stop({ opsPath }) {
	console.log(gray('  stop ops'));
	execa.sync('sh', ['-c', `cd ${opsPath}/ops && docker-compose down -v`]);
}
