'use strict';

const { gray, redBright } = require('chalk');
const {
	utils: { parseUnits, formatUnits },
} = require('ethers');
const { toBytes32 } = require('../../../..');

module.exports = async ({
	addressOf,
	deployer,
	forceUpdateInverseSynthsOnTestnet,
	network,
	oldExrates,
	runStep,
	synths,
}) => {
	console.log(gray(`\n------ CONFIGURE INVERSE SYNTHS ------\n`));

	const { ExchangeRates } = deployer.deployedContracts;

	for (const { name: currencyKey, inverted } of synths) {
		if (inverted) {
			const { entryPoint, upperLimit, lowerLimit } = inverted;

			// helper function
			const setInversePricing = ({ freezeAtUpperLimit, freezeAtLowerLimit }) =>
				runStep({
					contract: 'ExchangeRates',
					target: ExchangeRates,
					write: 'setInversePricing',
					writeArg: [
						toBytes32(currencyKey),
						parseUnits(entryPoint.toString()).toString(),
						parseUnits(upperLimit.toString()).toString(),
						parseUnits(lowerLimit.toString()).toString(),
						freezeAtUpperLimit,
						freezeAtLowerLimit,
					],
					comment: `Configure inverse pricing for ${currencyKey} in ExchangeRates`,
				});

			// when the oldExrates exists - meaning there is a valid ExchangeRates in the existing deployment.json
			// for this environment (true for all environments except the initial deploy in 'local' during those tests)
			if (oldExrates) {
				// get inverse synth's params from the old exrates, if any exist
				const oldInversePricing = await oldExrates.inversePricing(toBytes32(currencyKey));

				const {
					entryPoint: oldEntryPoint,
					upperLimit: oldUpperLimit,
					lowerLimit: oldLowerLimit,
					frozenAtUpperLimit: currentRateIsFrozenUpper,
					frozenAtLowerLimit: currentRateIsFrozenLower,
				} = oldInversePricing;

				const currentRateIsFrozen = currentRateIsFrozenUpper || currentRateIsFrozenLower;
				// and the last rate if any exists
				const currentRateForCurrency = await oldExrates.rateForCurrency(toBytes32(currencyKey));

				// and total supply, if any
				const synth = deployer.deployedContracts[`Synth${currencyKey}`];
				const totalSynthSupply = await synth.totalSupply();
				console.log(gray(`totalSupply of ${currencyKey}: ${Number(totalSynthSupply)}`));

				const inversePricingOnCurrentExRates = await ExchangeRates.inversePricing(
					toBytes32(currencyKey)
				);

				// ensure that if it's a newer exchange rates deployed, then skip reinserting the inverse pricing if
				// already done
				if (
					oldExrates.address !== ExchangeRates.address &&
					JSON.stringify(inversePricingOnCurrentExRates) === JSON.stringify(oldInversePricing) &&
					+formatUnits(inversePricingOnCurrentExRates.entryPoint) === entryPoint &&
					+formatUnits(inversePricingOnCurrentExRates.upperLimit) === upperLimit &&
					+formatUnits(inversePricingOnCurrentExRates.lowerLimit) === lowerLimit
				) {
					console.log(
						gray(
							`Current ExchangeRates.inversePricing(${currencyKey}) is the same as the previous. Nothing to do.`
						)
					);
				}
				// When there's an inverted synth with matching parameters
				else if (
					entryPoint === +formatUnits(oldEntryPoint) &&
					upperLimit === +formatUnits(oldUpperLimit) &&
					lowerLimit === +formatUnits(oldLowerLimit)
				) {
					if (oldExrates.address !== addressOf(ExchangeRates)) {
						const freezeAtUpperLimit = +formatUnits(currentRateForCurrency) === upperLimit;
						const freezeAtLowerLimit = +formatUnits(currentRateForCurrency) === lowerLimit;
						console.log(
							gray(
								`Detected an existing inverted synth for ${currencyKey} with identical parameters and a newer ExchangeRates. ` +
									`Persisting its frozen status (${currentRateIsFrozen}) and if frozen, then freeze rate at upper (${freezeAtUpperLimit}) or lower (${freezeAtLowerLimit}).`
							)
						);

						// then ensure it gets set to the same frozen status and frozen rate
						// as the old exchange rates
						await setInversePricing({
							freezeAtUpperLimit,
							freezeAtLowerLimit,
						});
					} else {
						console.log(
							gray(
								`Detected an existing inverted synth for ${currencyKey} with identical parameters and no new ExchangeRates. Skipping check of frozen status.`
							)
						);
					}
				} else if (Number(currentRateForCurrency) === 0) {
					console.log(gray(`Detected a new inverted synth for ${currencyKey}. Proceeding to add.`));
					// Then a new inverted synth is being added (as there's no previous rate for it)
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else if (Number(totalSynthSupply) === 0) {
					console.log(
						gray(
							`Inverted synth at ${currencyKey} has 0 total supply and its inverted parameters have changed. ` +
								`Proceeding to reconfigure its parameters as instructed, unfreezing it if currently frozen.`
						)
					);
					// Then a new inverted synth is being added (as there's no existing supply)
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else if (network !== 'mainnet' && forceUpdateInverseSynthsOnTestnet) {
					// as we are on testnet and the flag is enabled, allow a mutative pricing change
					console.log(
						redBright(
							`⚠⚠⚠ WARNING: The parameters for the inverted synth ${currencyKey} ` +
								`have changed and it has non-zero totalSupply. This is allowed only on testnets`
						)
					);
					await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
				} else {
					// Then an existing synth's inverted parameters have changed.
					// For safety sake, let's inform the user and skip this step
					console.log(
						redBright(
							`⚠⚠⚠ WARNING: The parameters for the inverted synth ${currencyKey} ` +
								`have changed and it has non-zero totalSupply. This use-case is not supported by the deploy script. ` +
								`This should be done as a purge() and setInversePricing() separately`
						)
					);
				}
			} else {
				// When no exrates, then totally fresh deploy (local deployment)
				await setInversePricing({ freezeAtUpperLimit: false, freezeAtLowerLimit: false });
			}
		}
	}
};
