'use strict';

const { white, gray, yellow } = require('chalk');

module.exports = async ({ deployer, freshDeploy, runStep }) => {
	console.log(gray(`\n------ IMPORT DEBT-CACHE EXCLUDED-DEBT RECORDS ------\n`));

	const { DebtCache } = deployer.deployedContracts;

	// fresh deploys or no new debt cache mean this should be skipped
	if (freshDeploy) {
		console.log(gray(`freshDeploy - no excluded debt required to import. Skipping.`));
		return;
	}

	const ExistingDebtCache = deployer.getExistingContract({ contract: 'DebtCache' });
	const ExistingIssuer = deployer.getExistingContract({ contract: 'Issuer' });

	if (ExistingDebtCache.address === DebtCache.address) {
		console.log(gray(`No excluded debt required to import. Skipping.`));
		return;
	}

	console.log(gray(`Existing DebtCache (source of debts) at: ${white(ExistingDebtCache.address)}`));
	console.log(
		gray(`Existing Issuer (source of currencyKeys) at: ${white(ExistingIssuer.address)}`)
	);
	console.log(gray(`New DebtCache at: ${yellow(DebtCache.address)}`));

	await runStep({
		contract: 'DebtCache',
		target: DebtCache,
		write: 'importExcludedIssuedDebts',
		writeArg: [ExistingDebtCache.address, ExistingIssuer.address],
		comment: `Import excluded-debt records from existing DebtCache`,
	});
};
