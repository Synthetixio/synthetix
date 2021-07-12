'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Web3 = require('web3');
const axios = require('axios');

require('dotenv').config();

const { loadConnections, stringify } = require('../../publish/src/util');

const { wrap } = require('../..');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const network = process.env.ETH_NETWORK;

const { getTarget, getSource } = wrap({ network, fs, path });

describe(`Etherscan on ${network}`, () => {
	// we need this outside the test runner in order to generate tests per contract name
	const targets = getTarget();
	const { providerUrl, etherscanUrl, explorerLinkPrefix } = loadConnections({
		network,
	});

	let sources;
	let web3;

	beforeEach(() => {
		// reset this each test to prevent it getting overwritten
		sources = getSource();
		web3 = new Web3();

		web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
	});

	Object.values(targets).forEach(({ name, source, address }) => {
		describe(`${name}`, () => {
			it(`Etherscan has the correct ABI at ${explorerLinkPrefix}/address/${address}`, async () => {
				const response = await axios.get(etherscanUrl, {
					params: {
						module: 'contract',
						action: 'getabi',
						address,
						apikey: process.env.ETHERSCAN_KEY,
					},
				});
				let result;
				try {
					result = JSON.parse(response.data.result);
				} catch (err) {
					console.log('Error Etherscan returned the following:', response.data.result);
					throw err;
				}

				const sortByName = (a, b) =>
					(a.name || 'constructor') > (b.name || 'constructor') ? 1 : -1;

				const removeSignaturesAndVariableNames = entry => {
					delete entry.signature;
					// Some contracts, such as ProxyERC20 were deployed with different function
					// input names than currently in the code, so reomve these from the check
					// specifically balanceOf(address owner) was changed to balanceOf(address account)
					(entry.inputs || []).forEach(input => {
						delete input.name;
						delete input.internalType;
					});

					(entry.outputs || []).forEach(output => {
						delete output.internalType;
					});

					// Special edge-case: TokenStateSynthetix on mainnet has older
					// method name "nominateOwner" over "nominateNewOwner"
					if (
						network === 'mainnet' &&
						name === 'TokenStateSynthetix' &&
						entry.name === 'nominateOwner'
					) {
						entry.name = 'nominateNewOwner';
					}
					return entry;
				};

				const actual = stringify(result.sort(sortByName).map(removeSignaturesAndVariableNames));
				const expected = stringify(
					sources[source].abi.sort(sortByName).map(removeSignaturesAndVariableNames)
				);

				assert.strictEqual(actual, expected);

				// wait 1.5s in order to prevent Etherscan rate limits (use 1.5s as parallel tests in CI
				// can trigger the limit)
				await sleep(1500);
			});

			it('ABI signature is correct', () => {
				const { abi } = sources[source];

				const { encodeFunctionSignature, encodeEventSignature } = web3.eth.abi;

				for (const { type, inputs, name, signature } of abi) {
					// when the ABI has no signature for an entry, skip it
					// this happens when the ABIs weren't generated in a build but
					// rather taken from Etherscan as was the case with early StakingRewards
					if (!signature) {
						continue;
					}
					if (type === 'function') {
						assert.strictEqual(
							encodeFunctionSignature({ name, inputs }),
							signature,
							`${source}.${name} signature mismatch`
						);
					} else if (type === 'event') {
						assert.strictEqual(
							encodeEventSignature({ name, inputs }),
							signature,
							`${source}.${name} signature mismatch`
						);
					}
				}
			});
		});
	});
});
