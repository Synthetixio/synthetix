const ethers = require('ethers');

// Futures V2 Proxy
const excludedFunctions = [
	// Owned
	'nominateNewOwner',
	'acceptOwnership',
	'nominatedOwner',
	'owner',
	// MixinResolver
	'resolver',
	'resolverAddressesRequired',
	'rebuildCache',
	'isResolvedCache',
	// ProxyFuturesV2
	'getRoutesPage',
	// FuturesV2MarketBase
	'marketState',
];

const getFunctionSignatures = (instance, excludedFunctions) => {
	const contractInterface = new ethers.utils.Interface(instance.abi);
	const signatures = [];
	const funcNames = Object.keys(contractInterface.functions);
	for (const funcName of funcNames) {
		const signature = {
			signature: contractInterface.getSighash(contractInterface.functions[funcName]),
			functionName: contractInterface.functions[funcName].name,
			stateMutability: contractInterface.functions[funcName].stateMutability,
			isView: contractInterface.functions[funcName].stateMutability === 'view',
		};
		signatures.push(signature);
	}
	return signatures.filter(f => !excludedFunctions.includes(f.functionName));
};

module.exports = {
	excludedFunctions,
	getFunctionSignatures,
};
