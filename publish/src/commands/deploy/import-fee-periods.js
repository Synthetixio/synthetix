'use strict';

const path = require('path');
const fs = require('fs');
const { white, gray, yellow } = require('chalk');

const { confirmAction, stringify } = require('../../util');

const pathToLocal = name => path.join(__dirname, `${name}.json`);

const saveFeePeriodsToFile = ({ network, feePeriods, sourceContractAddress }) => {
	fs.writeFileSync(
		pathToLocal(`recent-feePeriods-${network}-${sourceContractAddress}`),
		stringify(feePeriods)
	);
};

module.exports = async ({
	deployer,
	explorerLinkPrefix,
	freshDeploy,
	generateSolidity,
	network,
	override,
	runStep,
	skipTimeCheck = false,
	systemSuspended,
	useFork,
	yes,
}) => {
	console.log(gray(`\n------ IMPORT FEE PERIODS ------\n`));

	const { FeePool } = deployer.deployedContracts;
	// fresh deploys or no new fee pool mean this should be skipped
	if (freshDeploy || !FeePool.justDeployed) {
		console.log(gray(`No fee periods required for import. Skipping.`));
		return;
	}

	const ExistingFeePool = deployer.getExistingContract({ contract: 'FeePool' });

	const feePeriods = [];

	if (ExistingFeePool.address === FeePool.address) {
		throw Error(
			'import-fee-periods: The FeePool in the versions.json is the same as the current ' +
				'- this step assumes a new FeePool has been deployed yet not released - ' +
				'have you already released before importing the fee period?'
		);
	} else {
		console.log(gray(`Reading from existing FeePool at: ${white(ExistingFeePool.address)}`));
		console.log(gray(`Importing into new FeePool at: ${yellow(FeePool.address)}`));
	}

	if (!systemSuspended && !generateSolidity && !useFork) {
		throw Error(
			'import-fee-periods: Cannot import fee periods while the system is not suspended as this could mean data loss'
		);
	}

	const feePeriodLength = await ExistingFeePool.FEE_PERIOD_LENGTH();

	// Check sources
	for (let i = 0; i <= feePeriodLength - 1; i++) {
		const period = await ExistingFeePool.recentFeePeriods(i);
		if (!skipTimeCheck && !generateSolidity) {
			if (period.feePeriodId === '0') {
				throw Error(
					`Fee period at index ${i} has NOT been set. Are you sure this is the right FeePool source? ${explorerLinkPrefix}/address/${ExistingFeePool.address} `
				);
			} else if (i === 0 && period.startTime < Date.now() / 1000 - 3600 * 24 * 7) {
				throw Error(
					`The initial fee period is more than one week ago - this is likely an error. ` +
						`Please check to make sure you are using the correct FeePool source (this should ` +
						`be the one most recently replaced). Given: ${explorerLinkPrefix}/address/${ExistingFeePool.address}`
				);
			}
		}

		// remove redundant index keys (returned from struct calls)
		const filteredPeriod = {};
		Object.keys(period)
			.filter(key => /^[0-9]+$/.test(key) === false)
			.forEach(key => (filteredPeriod[key] = period[key]));

		feePeriods.push(filteredPeriod);
		console.log(
			gray(
				`loaded feePeriod ${i} from FeePool (startTime: ${new Date(
					filteredPeriod.startTime * 1000
				)})`
			)
		);
	}

	// Check target does not have existing periods
	if (!override) {
		for (let i = 0; i < feePeriodLength; i++) {
			const period = await FeePool.recentFeePeriods(i);
			// ignore any initial entry where feePeriodId is 1 as this is created by the FeePool constructor
			if (period.feePeriodId.toString() !== '1' && period.startTime.toString() !== '0') {
				throw Error(
					`The new target FeePool already has imported fee periods (one or more entries has ` +
						`startTime as 0. Please check to make sure you are using the latest FeePool ` +
						`(this should be the most recently deployed). Given: ${explorerLinkPrefix}/address/${FeePool.address}`
				);
			}
		}
	} else {
		console.log(
			gray('Warning: Setting target to override - ignoring existing FeePool periods in target!')
		);
	}

	console.log(gray('The fee periods to import over are as follows:'));
	console.log(gray(stringify(feePeriods)));

	saveFeePeriodsToFile({ network, feePeriods, sourceContractAddress: ExistingFeePool.address });

	let index = 0;
	for (const feePeriod of feePeriods) {
		console.log('Fee period to import is as follows:');
		console.log(stringify(feePeriod));

		if (!yes) {
			try {
				await confirmAction(
					yellow(
						`Do you want to continue importing this fee period in index position ${index} (y/n) ?`
					)
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		const importArgs = [
			index,
			feePeriod.feePeriodId,
			feePeriod.startingDebtIndex,
			feePeriod.startTime,
			feePeriod.feesToDistribute,
			feePeriod.feesClaimed,
			feePeriod.rewardsToDistribute,
			feePeriod.rewardsClaimed,
		];

		await runStep({
			contract: 'FeePool',
			target: FeePool,
			write: 'importFeePeriod',
			writeArg: importArgs,
			comment: `Import fee period from existing fee pool at index ${index}`,
			customSolidity: {
				name: `importFeePeriod_${index}`,
				instructions: [
					`FeePool existingFeePool = FeePool(${ExistingFeePool.address})`,
					`FeePool newFeePool = FeePool(${FeePool.address})`,
					`(
						uint64 feePeriodId_${index},
						uint64 startingDebtIndex_${index},
						uint64 startTime_${index},
						uint feesToDistribute_${index},
						uint feesClaimed_${index},
						uint rewardsToDistribute_${index},
						uint rewardsClaimed_${index}
					) = existingFeePool.recentFeePeriods(${index})`,
					`newFeePool.importFeePeriod(
						${index},
						feePeriodId_${index},
						startingDebtIndex_${index},
						startTime_${index},
						feesToDistribute_${index},
						feesClaimed_${index},
						rewardsToDistribute_${index},
						rewardsClaimed_${index}
					)`,
				],
			},
		});

		index++;
	}
};
