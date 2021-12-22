const { artifacts, web3 } = require('hardhat');

const abiDecoder = require('abi-decoder');
const { smockit } = require('@eth-optimism/smock');

const { assert } = require('./common');

const { currentTime, toUnit } = require('../utils')();
const {
	toBytes32,
	constants: { ZERO_ADDRESS, ZERO_BYTES32 },
} = require('../..');

const MockAggregator = artifacts.require('MockAggregatorV2V3');

/// utility function to setup price aggregators
/// @param exchangeRates instance of ExchangeRates contract
/// @param owner owner account of exchangeRates contract for adding an aggregator
/// @param keys array of bytes32 currency keys
/// @param decimalsArray optional array of ints for each key, defaults to 18 decimals
async function setupPriceAggregators(exchangeRates, owner, keys, decimalsArray = []) {
	let aggregator;
	for (let i = 0; i < keys.length; i++) {
		aggregator = await MockAggregator.new({ from: owner });
		await aggregator.setDecimals(decimalsArray.length > 0 ? decimalsArray[i] : 18);
		await exchangeRates.addAggregator(keys[i], aggregator.address, { from: owner });
	}
}

/// same as setupPriceAggregators, but checks if an aggregator for that currency is already setup up
async function setupMissingPriceAggregators(exchangeRates, owner, keys) {
	const missingKeys = [];
	for (let i = 0; i < keys.length; i++) {
		if ((await exchangeRates.aggregators(keys[i])) === ZERO_ADDRESS) {
			missingKeys.push(keys[i]);
		}
	}
	await setupPriceAggregators(exchangeRates, owner, missingKeys);
}
// utility function update rates for aggregators that are already set up
/// @param exchangeRates instance of ExchangeRates contract
/// @param owner owner account of exchangeRates contract for adding an aggregator
/// @param keys array of bytes32 currency keys
/// @param rates array of BN rates
/// @param timestamp optional timestamp for the update, currentTime() is used by default
async function updateAggregatorRates(exchangeRates, keys, rates, timestamp = undefined) {
	timestamp = timestamp || (await currentTime());
	for (let i = 0; i < keys.length; i++) {
		const aggregatorAddress = await exchangeRates.aggregators(keys[i]);
		const aggregator = await MockAggregator.at(aggregatorAddress);
		// set the rate
		await aggregator.setLatestAnswer(rates[i], timestamp);
	}
}

module.exports = {
	/**
	 * the truffle transaction does not return all events logged, only those from the invoked
	 * contract and ERC20 Transfer events (see https://github.com/trufflesuite/truffle/issues/555),
	 * so we decode the logs with the ABIs we are using specifically and check the output
	 */
	async getDecodedLogs({ hash, contracts = [] }) {
		// Get receipt to collect all transaction events
		const receipt = await web3.eth.getTransactionReceipt(hash);

		// And required ABIs to fully decode them
		contracts.forEach(contract => {
			const abi = 'abi' in contract ? contract.abi : artifacts.require(contract).abi;
			abiDecoder.addABI(abi);
		});

		return abiDecoder.decodeLogs(receipt.logs);
	},

	// Assert against decoded logs
	decodedEventEqual({ event, emittedFrom, args, log, bnCloseVariance = '10' }) {
		assert.equal(log.name, event);
		assert.equal(log.address, emittedFrom, 'log emission address does not match');
		args.forEach((arg, i) => {
			const { type, value } = log.events[i];

			// // for debugging
			// console.log(i, arg.toString(), value.toString())

			if (type === 'address') {
				assert.equal(
					web3.utils.toChecksumAddress(value),
					web3.utils.toChecksumAddress(arg),
					`arg '${arg}' does not match`
				);
			} else if (/^u?int/.test(type)) {
				assert.bnClose(new web3.utils.BN(value), arg, bnCloseVariance);
			} else {
				assert.equal(value, arg);
			}
		});
	},

	// Invoke a function on a proxy target via the proxy. It's like magic!
	async proxyThruTo({ proxy, target, fncName, from, call = false, args = [] }) {
		const abiEntry = target.abi.find(({ name }) => name === fncName);
		const data = web3.eth.abi.encodeFunctionCall(abiEntry, args);

		if (call) {
			const response = await web3.eth.call({ to: proxy.address, data });
			const decoded = web3.eth.abi.decodeParameters(abiEntry.outputs, response);

			// if there are more than 1 returned params, return the entire object, otherwise
			// just the single parameter as web3 does using regular contract calls
			return abiEntry.outputs.length > 1 ? decoded : decoded[0];
		} else {
			return proxy.sendTransaction({ data, from });
		}
	},

	buildMinimalProxyCode(baseAddress, { includePrefix = true } = {}) {
		// See EIP-1167: https://eips.ethereum.org/EIPS/eip-1167#specification
		// Assumes the non-optimized version of the proxy
		const sanitizedBaseAddress = baseAddress.replace(/^0x/, '').toLowerCase();
		const code = `363d3d373d3d3d363d73${sanitizedBaseAddress}5af43d82803e903d91602b57fd5bf3`;
		return includePrefix ? `0x${code}` : code;
	},

	timeIsClose({ actual, expected, variance = 1 }) {
		assert.ok(
			Math.abs(Number(actual) - Number(expected)) <= variance,
			`Time is not within variance of ${variance}. Actual: ${Number(actual)}, Expected: ${expected}`
		);
	},

	trimUtf8EscapeChars(input) {
		return web3.utils.hexToAscii(web3.utils.utf8ToHex(input));
	},

	setupPriceAggregators,

	updateAggregatorRates,

	async updateRatesWithDefaults({ exchangeRates, owner, debtCache }) {
		const keys = ['SNX', 'sAUD', 'sEUR', 'sBTC', 'iBTC', 'sETH', 'ETH'].map(toBytes32);
		const rates = ['0.1', '0.5', '1.25', '5000', '4000', '172', '172'].map(toUnit);
		// set up any missing aggregators
		await setupMissingPriceAggregators(exchangeRates, owner, keys);

		await updateAggregatorRates(exchangeRates, keys, rates);
		await debtCache.takeDebtSnapshot();
	},

	async onlyGivenAddressCanInvoke({
		fnc,
		args,
		accounts,
		address = undefined,
		skipPassCheck = false,
		reason = undefined,
	}) {
		for (const user of accounts) {
			if (user === address) {
				continue;
			}

			await assert.revert(fnc(...args, { from: user }), reason);
		}
		if (!skipPassCheck && address) {
			await fnc(...args, { from: address });
		}
	},

	// Helper function that can issue synths directly to a user without having to have them exchange anything
	async issueSynthsToUser({ owner, issuer, addressResolver, synthContract, user, amount }) {
		// First override the resolver to make it seem the owner is the Synthetix contract
		await addressResolver.importAddresses(['Issuer'].map(toBytes32), [owner], {
			from: owner,
		});
		// now have the synth resync its cache
		await synthContract.rebuildCache();

		await synthContract.issue(user, amount, {
			from: owner,
		});

		// Now make sure to set the issuer address back to what it was afterwards
		await addressResolver.importAddresses(['Issuer'].map(toBytes32), [issuer.address], {
			from: owner,
		});
		await synthContract.rebuildCache();
	},

	async setExchangeWaitingPeriod({ owner, systemSettings, secs }) {
		await systemSettings.setWaitingPeriodSecs(secs.toString(), { from: owner });
	},

	async setExchangeFeeRateForSynths({ owner, systemSettings, synthKeys, exchangeFeeRates }) {
		await systemSettings.setExchangeFeeRateForSynths(synthKeys, exchangeFeeRates, {
			from: owner,
		});
	},

	convertToAggregatorPrice(val) {
		return web3.utils.toBN(Math.round(val * 1e8));
	},

	convertToDecimals(val, decimals) {
		return web3.utils.toBN(Math.round(val * Math.pow(10, decimals)));
	},

	ensureOnlyExpectedMutativeFunctions({
		abi,
		hasFallback = false,
		expected = [],
		ignoreParents = [],
	}) {
		const removeExcessParams = abiEntry => {
			// Clone to not mutate anything processed by truffle
			const clone = JSON.parse(JSON.stringify(abiEntry));
			// remove the signature in the cases where it's in the parent ABI but not the subclass
			delete clone.signature;
			// remove input and output named params
			(clone.inputs || []).map(input => {
				delete input.name;
				return input;
			});
			(clone.outputs || []).map(input => {
				delete input.name;
				return input;
			});
			return clone;
		};

		const combinedParentsABI = ignoreParents
			.reduce((memo, parent) => memo.concat(artifacts.require(parent).abi), [])
			.map(removeExcessParams);

		const fncs = abi
			.filter(
				({ type, stateMutability }) =>
					type === 'function' && stateMutability !== 'view' && stateMutability !== 'pure'
			)
			.map(removeExcessParams)
			.filter(
				entry =>
					!combinedParentsABI.find(
						parentABIEntry => JSON.stringify(parentABIEntry) === JSON.stringify(entry)
					)
			)
			.map(({ name }) => name);

		assert.bnEqual(
			fncs.sort(),
			expected.sort(),
			'Mutative functions should only be those expected.'
		);

		const fallbackFnc = abi.filter(({ type, stateMutability }) => type === 'fallback');

		assert.equal(
			fallbackFnc.length > 0,
			hasFallback,
			hasFallback ? 'No fallback function found' : 'Fallback function found when not expected'
		);
	},

	async setStatus({
		owner,
		systemStatus,
		section,
		synth = undefined,
		suspend = false,
		reason = '0',
	}) {
		if (section === 'System') {
			if (suspend) {
				await systemStatus.suspendSystem(reason, { from: owner });
			} else {
				await systemStatus.resumeSystem({ from: owner });
			}
		} else if (section === 'Issuance') {
			if (suspend) {
				await systemStatus.suspendIssuance(reason, { from: owner });
			} else {
				await systemStatus.resumeIssuance({ from: owner });
			}
		} else if (section === 'Exchange') {
			if (suspend) {
				await systemStatus.suspendExchange(reason, { from: owner });
			} else {
				await systemStatus.resumeExchange({ from: owner });
			}
		} else if (section === 'SynthExchange') {
			if (suspend) {
				await systemStatus.suspendSynthExchange(synth, reason, { from: owner });
			} else {
				await systemStatus.resumeSynthExchange(synth, { from: owner });
			}
		} else if (section === 'Synth') {
			if (suspend) {
				await systemStatus.suspendSynth(synth, reason, { from: owner });
			} else {
				await systemStatus.resumeSynth(synth, { from: owner });
			}
		} else {
			throw Error(`Section: ${section} unsupported`);
		}
	},

	async prepareSmocks({ accounts = [], contracts, mocks = {} }) {
		for (const [i, contract] of Object.entries(contracts).concat([
			[contracts.length, 'AddressResolver'],
		])) {
			const contractParts = contract.split(/:/);
			const source = contractParts[0];
			const label = contractParts[1] || source;

			if (mocks[label]) {
				continue; // prevent dupes
			}
			mocks[label] = await smockit(artifacts.require(source).abi, { address: accounts[i] });
		}

		const resolver = mocks['AddressResolver'];

		const returnMockFromResolver = contract => mocks[web3.utils.hexToUtf8(contract)].address;
		resolver.smocked.requireAndGetAddress.will.return.with(returnMockFromResolver);
		resolver.smocked.getAddress.will.return.with(returnMockFromResolver);

		return { mocks, resolver };
	},

	prepareFlexibleStorageSmock(flexibleStorage) {
		// Allow mocked flexible storage to be persisted through a run,
		// to build up configuration values over multiple contexts
		const flexibleStorageMemory = {};

		const flexibleStorageTypes = [
			['uint', 'getUIntValue', '0'],
			['int', 'getIntValue', '0'],
			['address', 'getAddressValue', ZERO_ADDRESS],
			['bool', 'getBoolValue', false],
			['bytes32', 'getBytes32Value', ZERO_BYTES32],
		];
		for (const [type, funcName, defaultValue] of flexibleStorageTypes) {
			flexibleStorage.smocked[funcName].will.return.with((contract, record) => {
				const storedValue =
					flexibleStorageMemory[contract] &&
					flexibleStorageMemory[contract][record] &&
					flexibleStorageMemory[contract][record][type];
				return storedValue || defaultValue;
			});
		}

		const bytes32SystemSettings = toBytes32('SystemSettings');
		return {
			mockSystemSetting: ({ type, setting, value }) => {
				const record = setting.startsWith('0x') ? setting : toBytes32(setting);

				flexibleStorageMemory[bytes32SystemSettings] =
					flexibleStorageMemory[bytes32SystemSettings] || {};
				flexibleStorageMemory[bytes32SystemSettings][record] =
					flexibleStorageMemory[bytes32SystemSettings][record] || {};
				flexibleStorageMemory[bytes32SystemSettings][record][type] =
					flexibleStorageMemory[bytes32SystemSettings][record][type] || {};

				if (type === 'uint' || type === 'int') {
					// Smock does not like non-native numbers like BNs, so downcast them to string
					value = String(value);
				}

				flexibleStorageMemory[bytes32SystemSettings][record][type] = value;
			},
		};
	},

	getEventByName({ tx, name }) {
		return tx.logs.find(({ event }) => event === name);
	},
};
