const commands = {
	deploy: require('../../../publish/src/commands/deploy').deploy,
};

async function main() {
	// Private key for deterministic account #0 when using hardhat node.
	const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

	await commands.deploy({
		concurrency: 1,
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: 'http://localhost:9545',
		gasPrice: '1',
		useOvm: false,
		privateKey,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: '9500000',
		ignoreCustomParameters: false,
	});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
