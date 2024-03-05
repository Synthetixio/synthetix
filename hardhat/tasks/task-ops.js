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
	.addFlag('start', 'Start the latest build')
	.addFlag('stop', 'Stop optimism chain')
	.addFlag('detached', 'Detach the chain from the console')
	.addOptionalParam('optimismPath', 'Path to optmism repository folder', './optimism')
	.setAction(async (taskArguments, hre, runSuper) => {
		taskArguments.maxMemory = true;

		const opsPath = taskArguments.optimismPath.replace('~', homedir);
		const opsDetached = taskArguments.detached ? '-d' : '';

		console.log(gray('optimism folder:', opsPath));

		if (taskArguments.stop) {
			console.log(yellow('stoping'));
			if (fs.existsSync(opsPath)) {
				_stop({ opsPath });
			}
			return;
		}

		if (taskArguments.start) {
			console.log(yellow('starting'));
			if (fs.existsSync(opsPath) && _isRunning({ opsPath })) {
				console.log(yellow('already running'));
				return;
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

async function _start({ opsPath, opsDetached }) {
	console.log(gray('  start ops'));
	execa.sync('sh', [
		'-c',
		`cd ${opsPath} && docker pull \
    us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:f707883038d527cbf1e9f8ea513fe33255deadbc`,
	]);
	spawn(
		'sh',
		[
			'-c',
			`cd ${opsPath} && docker run -d --name op-node -p 9545:8545 us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:f707883038d527cbf1e9f8ea513fe33255deadbc
	`,
		],
		{
			stdio: 'inherit',
		}
	);
	await new Promise(() => {}); // Keeps the process open
}

function _stop({ opsPath }) {
	console.log(gray('  stop ops'));
	execa.sync('sh', ['-c', `cd ${opsPath}/ops && docker-compose down -v`]);
}
