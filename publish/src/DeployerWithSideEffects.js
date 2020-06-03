const fs = require('fs');

const { stringify } = require('./util');
const Deployer = require('./Deployer');

/**
 * Deployer class which wraps on top of `Deployer` and does additional `side-effect-heavy` operations
 * such as updating `config.json`, and `deployments.json`. It also keeps track of newly deployed contracts
 */
class DeployerWithSideEffects {
	constructor({
		compiled,
		contractDeploymentGasLimit,
		config,
		configFile,
		deployment,
		deploymentFile,
		dryRun,
		gasPrice,
		methodCallGasLimit,
		network,
		providerUrl,
		privateKey,
	}) {
		this.deployer = new Deployer({
			compiled,
			config,
			gasPrice,
			methodCallGasLimit,
			contractDeploymentGasLimit,
			deployment,
			privateKey,
			providerUrl,
		});

		// Config
		this.network = network;
		this.dryRun = dryRun;

		// Files
		this.deploymentFile = deploymentFile;
		this.configFile = configFile;

		// now clone these so we can update and write them after each deployment but keep the original
		// flags available
		this.updatedConfig = JSON.parse(JSON.stringify(config));

		// Keep track of new contracts deployed
		this.newContractsDeployed = [];
	}

	async deployContract({ name, source = name, args, deps, force = false }) {
		const deployedContract = await this.deployer.deploy({
			name,
			source,
			args,
			deps,
			force,
			dryRun: this.dryRun,
		});
		if (!deployedContract) {
			return;
		}
		const { address } = deployedContract.options;

		let timestamp = new Date();
		let txn = '';
		if (this.deployer.config[name] && !this.deployer.config[name].deploy) {
			// deploy is false, so we reused a deployment, thus lets grab the details that already exist
			timestamp = this.deployer.deployment.targets[name].timestamp;
			txn = this.deployer.deployment.targets[name].txn;
		}
		// now update the deployed contract information
		this.deployer.deployment.targets[name] = {
			name,
			address,
			source,
			link: `https://${this.network !== 'mainnet' ? this.network + '.' : ''}etherscan.io/address/${
				this.deployer.deployedContracts[name].options.address
			}`,
			timestamp,
			txn,
			network: this.network,
		};
		if (deployedContract.options.deployed) {
			// track the new source and bytecode
			this.deployer.deployment.sources[source] = {
				bytecode: this.deployer.compiled[source].evm.bytecode.object,
				abi: this.deployer.compiled[source].abi,
			};
			// add to the list of deployed contracts for later reporting
			this.newContractsDeployed.push({
				name,
				address,
			});
		}
		if (!this.dryRun) {
			fs.writeFileSync(this.deploymentFile, stringify(this.deployer.deployment));
		}

		// now update the flags to indicate it no longer needs deployment,
		// ignoring this step for local, which wants a full deployment by default
		if (this.network !== 'local' && !this.dryRun) {
			this.updatedConfig[name] = { deploy: false };
			fs.writeFileSync(this.configFile, stringify(this.updatedConfig));
		}

		return deployedContract;
	}
}

module.exports = DeployerWithSideEffects;
