const { extendEnvironment } = require('hardhat/config');

extendEnvironment(hre => {
	// NOTE: mutating hre.artifacts seems to cause issues with solidity-coverage, so adding
	// "linkWithLegacySupport" to hre is a workaround
	// base definition of legacy link support (no legacy support by default)
	// hre.linkWithLegacySupport = async (artifact, linkTo) => {
	// 	if (!hre.legacy) {
	// 		return artifact.link(await hre.artifacts.require(linkTo).new());
	// 	}
	// 	const originalContractName = artifact.contractName;
	// 	if (artifact.legacy) {
	// 		// This little hack is necessary as artifact.link will use the contractName to
	// 		// lookup the contract's bytecode and we need it
	// 		artifact.contractName += '_Legacy';
	// 	}
	// 	await artifact.link(
	// 		// link SafeDecimalMath - which will use legacy by default in legacy mode
	// 		// UNLESS this artifact is not a legacy one
	// 		await hre.artifacts.require(linkTo, { ignoreLegacy: !artifact.legacy }).new()
	// 	);
	// 	artifact.contractName = originalContractName;
	// };
	// 	// extend how contract testing works
	// 	const oldContractFnc = hre.contract;
	//
	// 	hre.contract = (contractStr, cb) => {
	// 		oldContractFnc(contractStr, accounts => {
	// 			const [contract] = contractStr.split(/\s/); // take the first word as the contract name (ignoring "@xyz" grep tag suffixes)
	// 			const oldRequire = hre.artifacts.require.bind(hre.artifacts);
	//
	// 			// Prevent the contract undergoing testing from using the legacy source file
	// 			// (cause the tests are designed for the newer source, not the legacy)
	// 			before(() => {
	// 				if (hre.legacy) {
	// 					hre.artifacts.require = (name, opts = {}) => {
	// 						if (name === contract || opts.ignoreLegacy) {
	// 							return oldRequire(name);
	// 						}
	// 						try {
	// 							const artifact = oldRequire(name + '_Legacy');
	// 							artifact.legacy = true;
	// 							if (process.env.DEBUG) {
	// 								log('Using legacy source for', name);
	// 							}
	// 							return artifact;
	// 						} catch (err) {
	// 							return oldRequire(name);
	// 						}
	// 					};
	// 				}
	// 			});
	//
	// 			after(() => {
	// 				hre.artifacts.require = oldRequire;
	// 			});
	//
	// 			describe(
	// 				hre.legacy
	// 					? 'when integrating with legacy contracts'
	// 					: 'when integrating with modern contracts',
	// 				() => cb(accounts)
	// 			);
	// 		});
	// 	};
});
