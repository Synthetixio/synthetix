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
	// ProxyPerpsV2
	'addRoute',
	'removeRoute',
	'getRoutesPage',
	'getRoutesLength',
	'getRoutesPage',
	'getAllTargets',
	// PerpsV2MarketBase
	'marketState',
];

const getFunctionSignatures = (instance, excludedFunctions) => {
	const contractInterface = instance.abi
		? new ethers.utils.Interface(instance.abi)
		: instance.interface;
	const signatures = [];
	const funcNames = Object.keys(contractInterface.functions);
	for (const funcName of funcNames) {
		const signature = {
			signature: contractInterface.getSighash(contractInterface.functions[funcName]),
			functionName: contractInterface.functions[funcName].name,
			stateMutability: contractInterface.functions[funcName].stateMutability,
			isView: contractInterface.functions[funcName].stateMutability === 'view',
			contractAddress: instance.address,
		};
		signatures.push(signature);
	}
	return signatures.filter(f => !excludedFunctions.includes(f.functionName));
};

module.exports = {
	excludedFunctions,
	getFunctionSignatures,
};
