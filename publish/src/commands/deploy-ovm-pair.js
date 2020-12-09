const { red } = require('chalk');
const commands = {
	build: require('./build').build,
	deploy: require('./deploy').deploy,
	connectBridge: require('./connect-bridge').connectBridge,
};
const ethers = require('ethers');
const deploymentJSON = require('../../deployed/local-ovm/deployment');
const snxABI = deploymentJSON.sources.MintableSynthetix.abi;
const synthABI = deploymentJSON.sources.Synth.abi;

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';

const deployOvmPair = async () => {
	// This private key is #4 displayed when starting optimism-integration.
	// When used on a fresh L2 chain, it passes all safety checks.
	const privateKey = '0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7';

	await deployInstance({ useOvm: true, privateKey });
	const l2provider = new ethers.providers.JsonRpcProvider(L2_PROVIDER_URL);
	const l2wallet = new ethers.Wallet(
		'0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7',
		l2provider
	);
	const Synthetix = new ethers.Contract(
		'0xf20998D8f01E901ACdF8a5aD75Adeb67E26a33Ae',
		snxABI,
		l2wallet
	);
	const ProxySUSD = new ethers.Contract(
		'0xb20377067815a874b4Ea4b85718d7Fc715717DaB',
		synthABI,
		l2wallet
	);
	const snxBalance = await Synthetix.balanceOf(l2wallet.address);
	console.log(`SNX balance of ${l2wallet.address}`, snxBalance.toString());
	let susdBalance = await ProxySUSD.balanceOf(l2wallet.address);
	console.log(`SUSD balance of ${l2wallet.address}`, susdBalance.toString());
	await (await Synthetix.issueMaxSynths()).wait();
	console.log('issued max synths');
	susdBalance = await ProxySUSD.balanceOf(l2wallet.address);
	console.log(`SUSD balance of ${l2wallet.address}`, susdBalance.toString());
};

const deployInstance = async ({ useOvm, privateKey }) => {
	await commands.build({ useOvm });
	try {
		await commands.deploy({
			network: 'local',
			freshDeploy: true,
			yes: true,
			providerUrl: useOvm ? L2_PROVIDER_URL : L1_PROVIDER_URL,
			gasPrice: '0',
			useOvm,
			methodCallGasLimit: '3500000',
			contractDeploymentGasLimit: useOvm ? '11000000' : '9500000',
			privateKey,
		});
	} catch (error) {
		console.log('deploy failed, trying again...');
	}
	// lol the first deploy always fails so... yeah
	await commands.deploy({
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: useOvm ? L2_PROVIDER_URL : L1_PROVIDER_URL,
		gasPrice: '0',
		useOvm,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: useOvm ? '11000000' : '9500000',
		privateKey,
	});
};

module.exports = {
	deployOvmPair,
	cmd: program =>
		program
			.command('deploy-ovm-pair')
			.description(
				'Deploys a pair of L1 and L2 instances on local running chains started with `optimism-integration`, and connects them together. To be used exclusively for local testing.'
			)
			.action(async (...args) => {
				try {
					await deployOvmPair(...args);
				} catch (err) {
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
