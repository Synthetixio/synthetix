'use strict';

const { gray } = require('chalk');

module.exports = async ({ addressOf, deployer, runStep, synthsToAdd }) => {
	console.log(gray(`\n------ ADD SYNTHS TO ISSUER ------\n`));

	const { Issuer } = deployer.deployedContracts;

	// Set up the connection to the Issuer for each Synth (requires FlexibleStorage to have been configured)

	// First filter out all those synths which are already properly imported
	console.log(gray('Filtering synths to add to the issuer.'));
	const filteredSynths = [];
	for (const synth of synthsToAdd) {
		const issuerSynthAddress = await Issuer.synths(synth.currencyKeyInBytes);
		const currentSynthAddress = addressOf(synth.synth);
		if (issuerSynthAddress === currentSynthAddress) {
			console.log(gray(`${currentSynthAddress} requires no action`));
		} else {
			console.log(gray(`${currentSynthAddress} will be added to the issuer.`));
			filteredSynths.push(synth);
		}
	}

	const synthChunkSize = 15;
	let batchCounter = 1;
	for (let i = 0; i < filteredSynths.length; i += synthChunkSize) {
		const chunk = filteredSynths.slice(i, i + synthChunkSize);
		await runStep({
			contract: 'Issuer',
			target: Issuer,
			read: 'getSynths',
			readArg: [chunk.map(synth => synth.currencyKeyInBytes)],
			expected: input =>
				input.length === chunk.length &&
				input.every((cur, idx) => cur === addressOf(chunk[idx].synth)),
			write: 'addSynths',
			writeArg: [chunk.map(synth => addressOf(synth.synth))],
			gasLimit: 1e5 * synthChunkSize,
			comment: `Add synths to the Issuer contract - batch ${batchCounter++}`,
		});
	}
};
