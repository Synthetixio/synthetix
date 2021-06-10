'use strict';

const {
	constants: { OVM_MAX_GAS_LIMIT },
	nonUpgradeable,
} = require('../../../..');

module.exports = ({
	config,
	contractDeploymentGasLimit,
	deployment,
	deploymentPath,
	freshDeploy,
	ignoreSafetyChecks,
	manageNonces,
	methodCallGasLimit,
	network,
	useOvm,
}) => {
	if (!ignoreSafetyChecks) {
		// Using Goerli without manageNonces?
		if (network.toLowerCase() === 'goerli' && !useOvm && !manageNonces) {
			throw new Error(`Deploying on Goerli needs to be performed with --manage-nonces.`);
		}

		// Cannot re-deploy legacy contracts
		if (!freshDeploy) {
			// Get list of contracts to be deployed
			const contractsToDeploy = [];
			Object.keys(config).map(contractName => {
				if (config[contractName].deploy) {
					contractsToDeploy.push(contractName);
				}
			});

			// Check that no non-deployable is marked for deployment.
			// Note: if nonDeployable = 'TokenState', this will match 'TokenStatesUSD'
			nonUpgradeable.map(nonUpgradeableContract => {
				contractsToDeploy.map(contractName => {
					if (contractName.match(new RegExp(`^${nonUpgradeableContract}`, 'g'))) {
						throw new Error(
							`You are attempting to deploy a contract marked as non-upgradeable: ${contractName}. This action could result in loss of state. Please verify and use --ignore-safety-checks if you really know what you're doing.`
						);
					}
				});
			});
		}

		// Every transaction in Optimism needs to be below 9m gas, to ensure
		// there are no deployment out of gas errors during fraud proofs.
		if (useOvm) {
			const maxOptimismGasLimit = OVM_MAX_GAS_LIMIT;
			if (
				contractDeploymentGasLimit > maxOptimismGasLimit ||
				methodCallGasLimit > maxOptimismGasLimit
			) {
				throw new Error(
					`Maximum transaction gas limit for OVM is ${maxOptimismGasLimit} gas, and specified contractDeploymentGasLimit and/or methodCallGasLimit are over such limit. Please make sure that these values are below the maximum gas limit to guarantee that fraud proofs can be done in L1.`
				);
			}
		}

		// Deploying on OVM and not using an OVM deployment path?
		const lastPathItem = deploymentPath.split('/').pop();
		const isOvmPath = lastPathItem.includes('ovm');
		const deploymentPathMismatch = (useOvm && !isOvmPath) || (!useOvm && isOvmPath);
		if (deploymentPathMismatch) {
			if (useOvm) {
				throw new Error(
					`You are deploying to a non-ovm path ${deploymentPath}, while --use-ovm is true.`
				);
			} else {
				throw new Error(
					`You are deploying to an ovm path ${deploymentPath}, while --use-ovm is false.`
				);
			}
		}

		// Fresh deploy and deployment.json not empty?
		if (freshDeploy && Object.keys(deployment.targets).length > 0 && network !== 'local') {
			throw new Error(
				`Cannot make a fresh deploy on ${deploymentPath} because a deployment has already been made on this path. If you intend to deploy a new instance, use a different path or delete the deployment files for this one.`
			);
		}
	}
};
