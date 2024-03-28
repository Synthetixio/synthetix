'use strict';

const { gray, yellow, red } = require('chalk');
const {
	utils: { formatUnits },
} = require('ethers');

const { catchMissingResolverWhenGeneratingSolidity } = require('../../util');

module.exports = async ({
	debtSnapshotMaxDeviation,
	deployer,
	generateSolidity,
	runStep,
	useOvm,
	useFork,
}) => {
	const { DebtCache } = deployer.deployedContracts;

	console.log(gray(`\n------ CHECKING DEBT CACHE ------\n`));

	const refreshSnapshotIfPossible = async (wasInvalid, isInvalid, force = false) => {
		const validityChanged = wasInvalid !== isInvalid;

		if (force || validityChanged) {
			console.log(yellow(`Refreshing debt snapshot...`));
			await runStep({
				gasLimit: 6.0e6,
				contract: 'DebtCache',
				target: DebtCache,
				write: 'takeDebtSnapshot',
				writeArg: [],
				publiclyCallable: true, // does not require owner
				skipSolidity: true, // should not be in an upgrade contract - it'll exceed the block gas limit
			});
		} else if (!validityChanged) {
			console.log(
				red('⚠⚠⚠ WARNING: Deployer attempted to refresh the debt cache, but it cannot be.')
			);
		}
	};

	const checkSnapshot = async ({ useFork }) => {
		const cacheInfo = await DebtCache.cacheInfo();
		const currentDebt = await DebtCache.currentDebt();

		// Check if the snapshot is stale and can be fixed.
		if (cacheInfo.isStale && !currentDebt.anyRateIsInvalid) {
			console.log(yellow('Debt snapshot is stale, and can be refreshed.'));
			await refreshSnapshotIfPossible(
				cacheInfo.isInvalid,
				currentDebt.anyRateIsInvalid,
				cacheInfo.isStale
			);
			return true;
		}

		// Otherwise, if the rates are currently valid,
		// we might still need to take a snapshot due to invalidity or deviation.
		if (!currentDebt.anyRateIsInvalid) {
			if (cacheInfo.isInvalid) {
				console.log(yellow('Debt snapshot is invalid, and can be refreshed.'));
				await refreshSnapshotIfPossible(
					cacheInfo.isInvalid,
					currentDebt.anyRateIsInvalid,
					cacheInfo.isStale
				);
				return true;
			} else {
				const cachedDebtEther = formatUnits(cacheInfo.debt);
				const currentDebtEther = formatUnits(currentDebt.debt);
				const deviation =
					(Number(currentDebtEther) - Number(cachedDebtEther)) / Number(cachedDebtEther);
				const maxDeviation = debtSnapshotMaxDeviation;

				if (maxDeviation <= Math.abs(deviation)) {
					console.log(
						yellow(
							`Debt cache deviation is ${deviation * 100}% >= ${maxDeviation *
								100}%; refreshing it...`
						)
					);
					await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, true);
					return true;
				}
			}
		}

		// Finally, if the debt cache is currently valid, but needs to be invalidated, we will also perform a snapshot.
		if (!cacheInfo.isInvalid && currentDebt.anyRateIsInvalid) {
			console.log(yellow('Debt snapshot needs to be invalidated.'));
			await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, false);
			return true;
		}
		return false;
	};

	try {
		const performedSnapshot = await checkSnapshot({ useFork });

		if (performedSnapshot) {
			console.log(gray('Snapshot complete.'));
		} else {
			console.log(gray('No snapshot required.'));
		}
	} catch (err) {
		catchMissingResolverWhenGeneratingSolidity({ contract: 'DebtSnapshot', err, generateSolidity });
	}
};
