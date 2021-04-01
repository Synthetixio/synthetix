const { artifacts, web3 } = require('hardhat');

const abiDecoder = require('abi-decoder');
const { smockit } = require('@eth-optimism/smock');

const { assert } = require('./common');

const { currentTime, toUnit } = require('../utils')();
const { toBytes32 } = require('../..');

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
		assert.equal(log.address, emittedFrom);
		args.forEach((arg, i) => {
			const { type, value } = log.events[i];
			if (type === 'address') {
				assert.equal(web3.utils.toChecksumAddress(value), web3.utils.toChecksumAddress(arg));
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

	buildMinimalProxyCode(baseAddress) {
		// See EIP-1167: https://eips.ethereum.org/EIPS/eip-1167#specification
		// Assumes the non-optimized version of the proxy
		const sanitizedBaseAddress = baseAddress.replace(/^0x/, '').toLowerCase();
		return `0x363d3d373d3d3d363d73${sanitizedBaseAddress}5af43d82803e903d91602b57fd5bf3`;
	},

	timeIsClose({ actual, expected, variance = 1 }) {
		assert.ok(
			Math.abs(Number(actual) - Number(expected)) <= variance,
			`Time is not within variance of ${variance}. Actual: ${Number(actual)}, Expected: ${expected}`
		);
	},

	async updateRatesWithDefaults({ exchangeRates, oracle, debtCache }) {
		const timestamp = await currentTime();

		const [SNX, sAUD, sEUR, sBTC, iBTC, sETH, ETH] = [
			'SNX',
			'sAUD',
			'sEUR',
			'sBTC',
			'iBTC',
			'sETH',
			'ETH',
		].map(toBytes32);

		await exchangeRates.updateRates(
			[SNX, sAUD, sEUR, sBTC, iBTC, sETH, ETH],
			['0.1', '0.5', '1.25', '5000', '4000', '172', '172'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

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
			if (mocks[contract]) {
				continue; // prevent dupes
			}
			mocks[contract] = await smockit(artifacts.require(contract).abi, { address: accounts[i] });
		}

		const resolver = mocks['AddressResolver'];

		const returnMockFromResolver = contract => mocks[web3.utils.hexToUtf8(contract)].address;
		resolver.smocked.requireAndGetAddress.will.return.with(returnMockFromResolver);
		resolver.smocked.getAddress.will.return.with(returnMockFromResolver);

		return { mocks, resolver };
	},

	getEventByName({ tx, name }) {
		return tx.logs.find(({ event }) => event === name);
	},
};
