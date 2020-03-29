'use strict';

const assert = require('assert');

const { getTarget, getSource } = require('../..');

// These functions are allowed to be duplicated between proxy and target
const exemptList = [
	'nominateNewOwner',
	'balanceOf',
	'acceptOwnership',
	'owner',
	'symbol',
	'allowance',
	'name',
	'totalSupply',
	'nominatedOwner',
	'transfer',
	'decimals',
	'transferFrom',
	'approve',
];

describe('proxy clash check', () => {
	// Add local?
	['kovan', 'rinkeby', 'ropsten', 'mainnet'].forEach(network => {
		describe(network, () => {
			const targets = getTarget({ network });
			const sources = getSource({ network });
			const contractPairs = new Map(); // proxy -> implementation

			it('Proxy contracts should not have any function hash collisions', () => {
				// 1) Map all proxy contracts with their target contracts
				for (const target in targets) {
					if (target.startsWith('Proxy')) {
						// console.log(targets[target].name);
						// console.log(targets[target].name.substring(5));
						if (targets[target].name === 'ProxyFeePool') {
							contractPairs.set(targets[target].name, 'FeePool');
						} else if (targets[target].name === 'ProxyERC20sUSD') {
							contractPairs.set(targets[target].name, 'SynthsUSD');
						} else if (targets[target].name === 'ProxySynthetix') {
							contractPairs.set(targets[target].name, 'Synthetix');
						} else if (targets[target].name === 'ProxyERC20') {
							contractPairs.set(targets[target].name, 'Synthetix');
						} else if (targets['Synth' + targets[target].name.substring(5)] !== undefined) {
							contractPairs.set(
								targets[target].name,
								targets['Synth' + targets[target].name.substring(5)].name
							);
						} else {
							assert(false, 'A proxy contract was detected but not matched against implementation');
						}
					}
				}

				// 2) Check for collisions in proxy functions and target functions
				for (const [proxy, target] of contractPairs.entries()) {
					const proxyABI = sources[targets[proxy].source].abi;
					const targetABI = sources[targets[target].source].abi;
					const functionSelectors = new Map(); // FunctionHash -> name
					for (const { type, name, signature } of proxyABI) {
						if (type === 'function') {
							functionSelectors.set(signature, name);
						}
					}
					for (const { type, name, signature } of targetABI) {
						if (type === 'function') {
							assert(
								!functionSelectors.has(signature) ||
									(exemptList.includes(name) && name === functionSelectors.get(signature)),
								`Function hash collision detected between function ${functionSelectors.get(
									signature
								)} of ${proxy} and function ${name} of ${target}`
							);
						}
					}
				}
			});
		});
	});
});
