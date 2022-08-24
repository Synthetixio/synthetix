'use strict';

const { gray, green, yellow } = require('chalk');

const ethers = require('ethers');

const { toBytes32 } = require('../../../..');

const { reportDeployedContracts } = require('../../util');

module.exports = async ({
	addressOf,
	continueEvenIfUnsuccessful,
	deployer,
	dryRun,
	limitPromise,
	runStep,
	useOvm,
}) => {
	console.log(gray(`\n------ CONFIGURE ADDRESS RESOLVER ------\n`));

	const { AddressResolver, ReadProxyAddressResolver } = deployer.deployedContracts;

	// Note: RPAR.setTarget(AR) MUST go before the addresses are imported into the resolver.
	// most of the time it will be a no-op but when there's a new AddressResolver, it's critical
	if (AddressResolver && ReadProxyAddressResolver) {
		await runStep({
			contract: 'ReadProxyAddressResolver',
			target: ReadProxyAddressResolver,
			read: 'target',
			expected: input => input === addressOf(AddressResolver),
			write: 'setTarget',
			writeArg: addressOf(AddressResolver),
			comment: 'set the target of the address resolver proxy to the latest resolver',
		});
	}

	let addressesAreImported = false;

	const newContractsBeingAdded = {};

	if (AddressResolver) {
		const addressArgs = [[], []];

		const allContracts = Object.entries(deployer.deployedContracts);
		await Promise.all(
			allContracts
				// ignore adding contracts with the skipResolver and library options
				.filter(([, contract]) => !contract.skipResolver && !contract.library)
				.map(([name, contract]) => {
					return limitPromise(async () => {
						const currentAddress = await AddressResolver.getAddress(toBytes32(name));

						// only import ext: addresses if they have never been imported before
						if (currentAddress !== contract.address) {
							console.log(green(`${name} needs to be imported to the AddressResolver`));

							addressArgs[0].push(toBytes32(name));
							addressArgs[1].push(contract.address);

							const { source, address } = contract;
							newContractsBeingAdded[contract.address] = { name, source, address, contract };
						}
					});
				})
		);

		// SIP-165 For debt pool synthesis, also add the ext:addresses, use the single network version if they exist in deployments
		for (const debtPoolContractName of ['AggregatorIssuedSynths', 'AggregatorDebtRatio']) {
			const resolverName = toBytes32(`ext:${debtPoolContractName}`);
			const currentAddress = await AddressResolver.getAddress(resolverName);
			const contract = deployer.deployedContracts[`OneNet${debtPoolContractName}`];

			if (currentAddress === ethers.constants.AddressZero && contract) {
				console.log(yellow('Importing special aggregator', debtPoolContractName));
				addressArgs[0].push(resolverName);
				addressArgs[1].push(contract.address);
			}
		}

		const { pending } = await runStep({
			gasLimit: 6e6, // higher gas required for mainnet
			contract: `AddressResolver`,
			target: AddressResolver,
			read: 'areAddressesImported',
			readArg: addressArgs,
			expected: input => input,
			write: 'importAddresses',
			writeArg: addressArgs,
			comment: 'Import all new contracts into the address resolver',
		});

		addressesAreImported = !pending;
	}

	// When addresses not yet imported, the deployment must be suspended until it can be completed by the owner.
	// This relies on the fact that runStep returns undefined if nothing needed to be done, a tx hash if the
	// transaction could be mined, and true in other cases, including appending to the owner actions file.
	// Note that this will also end the script in the case of manual transaction mining.
	if (!addressesAreImported) {
		console.log(gray(`\n------ DEPLOY PARTIALLY COMPLETED ------\n`));

		console.log(
			yellow(
				'⚠⚠⚠ WARNING: Addresses have not been imported into the resolver,' +
					' owner actions need to be performed before subsequent actions can be performed.'
			)
		);

		if (!dryRun) {
			if (deployer.newContractsDeployed.length > 0) {
				reportDeployedContracts({ deployer });
			}
			if (!continueEvenIfUnsuccessful) {
				console.log(gray('Stopping.'));
				// avoid silently "successful" test runs that don't run any tests
				process.exit(1);
			}
		}
	} else {
		console.log(gray('Addresses are correctly set up.'));
	}

	return { newContractsBeingAdded };
};
