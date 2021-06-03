'use strict';

const { gray, green, yellow } = require('chalk');
const { toBytes32 } = require('../../../..');

const { reportDeployedContracts } = require('../../util');

module.exports = async ({ addressOf, deployer, limitPromise, runStep }) => {
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
		});
	}

	let addressesAreImported = false;

	if (AddressResolver) {
		const addressArgs = [[], []];

		const allContracts = Object.entries(deployer.deployedContracts);
		await Promise.all(
			allContracts.map(([name, contract]) => {
				return limitPromise(async () => {
					const isImported = await AddressResolver.methods
						.areAddressesImported([toBytes32(name)], [contract.options.address])
						.call();

					if (!isImported) {
						console.log(green(`${name} needs to be imported to the AddressResolver`));

						addressArgs[0].push(toBytes32(name));
						addressArgs[1].push(contract.options.address);
					}
				});
			})
		);

		const { pending } = await runStep({
			gasLimit: 6e6, // higher gas required
			contract: `AddressResolver`,
			target: AddressResolver,
			read: 'areAddressesImported',
			readArg: addressArgs,
			expected: input => input,
			write: 'importAddresses',
			writeArg: addressArgs,
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
				'⚠⚠⚠ WARNING: Addresses have not been imported into the resolver, owner actions must be performed before re-running the script.'
			)
		);

		if (deployer.newContractsDeployed.length > 0) {
			reportDeployedContracts({ deployer });
		}

		process.exit();
	} else {
		console.log(gray('Addresses are correctly set up.'));
	}
};
