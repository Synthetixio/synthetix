const commands = {
	deploy: require('../../../publish/src/commands/deploy').deploy,
};
const {
	constants: { OVM_MAX_GAS_LIMIT },
} = require('../../../.');

async function main() {
	// Private key for deterministic account #0 when using hardhat node.
	const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

	await commands.deploy({
		concurrency: 1,
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: 'http://localhost:8545',
		gasPrice: '0',
		useOvm: true,
		privateKey,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: OVM_MAX_GAS_LIMIT,
		ignoreCustomParameters: false,
	});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
