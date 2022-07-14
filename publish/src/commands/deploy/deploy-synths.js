'use strict';

const { gray, yellow } = require('chalk');

const { confirmAction } = require('../../util');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({
	account,
	addressOf,
	addNewSynths,
	config,
	deployer,
	freshDeploy,
	generateSolidity,
	network,
	synths,
	systemSuspended,
	useFork,
	yes,
}) => {
	// ----------------
	// Synths
	// ----------------
	console.log(gray(`\n------ DEPLOY SYNTHS ------\n`));

	const { Issuer, ReadProxyAddressResolver } = deployer.deployedContracts;

	// The list of synth to be added to the Issuer once dependencies have been set up
	const synthsToAdd = [];

	for (const { name: currencyKey, subclass } of synths) {
		console.log(gray(`\n   --- SYNTH ${currencyKey} ---\n`));

		const tokenStateForSynth = await deployer.deployContract({
			name: `TokenState${currencyKey}`,
			source: 'TokenState',
			args: [account, ZERO_ADDRESS],
			force: addNewSynths,
		});

		const proxyForSynth = await deployer.deployContract({
			name: `Proxy${currencyKey}`,
			source: 'ProxyERC20',
			args: [account],
			force: addNewSynths,
		});

		const currencyKeyInBytes = toBytes32(currencyKey);

		const synthConfig = config[`Synth${currencyKey}`] || {};

		// track the original supply if we're deploying a new synth contract for an existing synth
		let originalTotalSupply = 0;
		if (synthConfig.deploy) {
			try {
				const oldSynth = deployer.getExistingContract({ contract: `Synth${currencyKey}` });
				originalTotalSupply = await oldSynth.totalSupply();
			} catch (err) {
				if (!freshDeploy) {
					// only throw if not local - allows local environments to handle both new
					// and updating configurations
					throw err;
				}
			}
		}

		// user confirm totalSupply is correct for oldSynth before deploy new Synth
		if (synthConfig.deploy && originalTotalSupply > 0) {
			if (!systemSuspended && !generateSolidity && !useFork) {
				console.log(
					yellow(
						'⚠⚠⚠ WARNING: The system is not suspended! Adding a synth here without using a migration contract is potentially problematic.'
					) +
						yellow(
							`⚠⚠⚠ Please confirm - ${network}:\n` +
								`Synth${currencyKey} totalSupply is ${originalTotalSupply} \n` +
								'NOTE: Deploying with this amount is dangerous when the system is not already suspended'
						),
					gray('-'.repeat(50)) + '\n'
				);

				if (!yes) {
					try {
						await confirmAction(gray('Do you want to continue? (y/n) '));
					} catch (err) {
						console.log(gray('Operation cancelled'));
						process.exit();
					}
				}
			}
		}

		const sourceContract = subclass || 'Synth';
		const synth = await deployer.deployContract({
			name: `Synth${currencyKey}`,
			source: sourceContract,
			deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
			args: [
				addressOf(proxyForSynth),
				addressOf(tokenStateForSynth),
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
				originalTotalSupply,
				addressOf(ReadProxyAddressResolver),
			],
			force: addNewSynths,
		});

		// Save the synth to be added once the AddressResolver has been synced.
		if (synth && Issuer) {
			synthsToAdd.push({
				synth,
				currencyKeyInBytes,
			});
		}
	}

	return {
		synthsToAdd,
	};
};
