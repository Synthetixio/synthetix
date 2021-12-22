const { assert } = require('chai');

const fs = require('fs');
const path = require('path');

const hardhat = require('hardhat');
// Note: the below is hardhat internal and is subject to change
const { normalizeHardhatNetworkAccountsConfig } = require('hardhat/internal/core/providers/util');
const ethers = require('ethers');

const {
	config: {
		networks: {
			hardhat: { accounts },
		},
	},
} = hardhat;

const BN = require('bn.js');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const UNIT = toWei(new BN('1'), 'ether');

const {
	constants: { CONTRACTS_FOLDER },
	getSource,
	getTarget,
} = require('../..');

const { loadCompiledFiles, getLatestSolTimestamp } = require('../../publish/src/solidity');

const deployCmd = require('../../publish/src/commands/deploy');

const { buildPath } = deployCmd.DEFAULTS;

module.exports = ({ web3 } = {}) => {
	// allow non-buidler based test tasks to pass thru web3
	web3 = web3 || hardhat.web3;

	/**
	 * Sets default properties on the jsonrpc object and promisifies it so we don't have to copy/paste everywhere.
	 */
	const send = payload => {
		if (!payload.jsonrpc) payload.jsonrpc = '2.0';
		if (!payload.id) payload.id = new Date().getTime();

		return new Promise((resolve, reject) => {
			web3.currentProvider.send(payload, (error, result) => {
				if (error) return reject(error);

				return resolve(result);
			});
		});
	};

	/**
	 *  Mines a single block in Ganache (evm_mine is non-standard)
	 */
	const mineBlock = () => send({ method: 'evm_mine' });

	/**
	 *  Gets the time of the last block.
	 */
	const currentTime = async () => {
		const { timestamp } = await web3.eth.getBlock('latest');
		return timestamp;
	};

	/**
	 *  Increases the time in the EVM.
	 *  @param seconds Number of seconds to increase the time by
	 */
	const fastForward = async seconds => {
		// It's handy to be able to be able to pass big numbers in as we can just
		// query them from the contract, then send them back. If not changed to
		// a number, this causes much larger fast forwards than expected without error.
		if (BN.isBN(seconds)) seconds = seconds.toNumber();

		// And same with strings.
		if (typeof seconds === 'string') seconds = parseFloat(seconds);

		let params = {
			method: 'evm_increaseTime',
			params: [seconds],
		};

		if (hardhat.ovm) {
			params = {
				method: 'evm_setNextBlockTimestamp',
				params: [(await currentTime()) + seconds],
			};
		}

		await send(params);

		await mineBlock();
	};

	/**
	 *  Increases the time in the EVM to as close to a specific date as possible
	 *  NOTE: Because this operation figures out the amount of seconds to jump then applies that to the EVM,
	 *  sometimes the result can vary by a second or two depending on how fast or slow the local EVM is responding.
	 *  @param time Date object representing the desired time at the end of the operation
	 */
	const fastForwardTo = async time => {
		if (typeof time === 'string') time = parseInt(time);

		const timestamp = await currentTime();
		const now = new Date(timestamp * 1000);
		if (time < now)
			throw new Error(
				`Time parameter (${time}) is less than now ${now}. You can only fast forward to times in the future.`
			);

		const secondsBetween = Math.floor((time.getTime() - now.getTime()) / 1000);

		await fastForward(secondsBetween);
	};

	/**
	 *  Takes a snapshot and returns the ID of the snapshot for restoring later.
	 */
	const takeSnapshot = async () => {
		const { result } = await send({ method: 'evm_snapshot' });
		await mineBlock();

		return result;
	};

	/**
	 *  Restores a snapshot that was previously taken with takeSnapshot
	 *  @param id The ID that was returned when takeSnapshot was called.
	 */
	const restoreSnapshot = async id => {
		await send({
			method: 'evm_revert',
			params: [id],
		});
		await mineBlock();
	};

	/**
	 *  Translates an amount to our canonical unit. We happen to use 10^18, which means we can
	 *  use the built in web3 method for convenience, but if unit ever changes in our contracts
	 *  we should be able to update the conversion factor here.
	 *  @param amount The amount you want to re-base to UNIT
	 */
	const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
	const fromUnit = amount => fromWei(amount, 'ether');

	/**
	 *  Translates an amount to our canonical precise unit. We happen to use 10^27, which means we can
	 *  use the built in web3 method for convenience, but if precise unit ever changes in our contracts
	 *  we should be able to update the conversion factor here.
	 *  @param amount The amount you want to re-base to PRECISE_UNIT
	 */
	const PRECISE_UNIT_STRING = '1000000000000000000000000000';
	const PRECISE_UNIT = toBN(PRECISE_UNIT_STRING);

	const toPreciseUnit = amount => {
		// Code is largely lifted from the guts of web3 toWei here:
		// https://github.com/ethjs/ethjs-unit/blob/master/src/index.js
		const amountString = amount.toString();

		// Is it negative?
		var negative = amountString.substring(0, 1) === '-';
		if (negative) {
			amount = amount.substring(1);
		}

		if (amount === '.') {
			throw new Error(`Error converting number ${amount} to precise unit, invalid value`);
		}

		// Split it into a whole and fractional part
		// eslint-disable-next-line prefer-const
		let [whole, fraction, ...rest] = amount.split('.');
		if (rest.length > 0) {
			throw new Error(`Error converting number ${amount} to precise unit, too many decimal points`);
		}

		if (!whole) {
			whole = '0';
		}
		if (!fraction) {
			fraction = '0';
		}
		if (fraction.length > PRECISE_UNIT_STRING.length - 1) {
			throw new Error(`Error converting number ${amount} to precise unit, too many decimal places`);
		}

		while (fraction.length < PRECISE_UNIT_STRING.length - 1) {
			fraction += '0';
		}

		whole = new BN(whole);
		fraction = new BN(fraction);
		let result = whole.mul(PRECISE_UNIT).add(fraction);

		if (negative) {
			result = result.mul(new BN('-1'));
		}

		return result;
	};

	const fromPreciseUnit = amount => {
		// Code is largely lifted from the guts of web3 fromWei here:
		// https://github.com/ethjs/ethjs-unit/blob/master/src/index.js
		const negative = amount.lt(new BN('0'));

		if (negative) {
			amount = amount.mul(new BN('-1'));
		}

		let fraction = amount.mod(PRECISE_UNIT).toString();

		while (fraction.length < PRECISE_UNIT_STRING.length - 1) {
			fraction = `0${fraction}`;
		}

		// Chop zeros off the end if there are extras.
		fraction = fraction.replace(/0+$/, '');

		const whole = amount.div(PRECISE_UNIT).toString();
		let value = `${whole}${fraction === '' ? '' : `.${fraction}`}`;

		if (negative) {
			value = `-${value}`;
		}

		return value;
	};

	/*
	 * Multiplies x and y interpreting them as fixed point decimal numbers.
	 */
	const multiplyDecimal = (x, y, unit = UNIT) => {
		const xBN = BN.isBN(x) ? x : new BN(x);
		const yBN = BN.isBN(y) ? y : new BN(y);
		return xBN.mul(yBN).div(unit);
	};

	/*
	 * Divides x and y interpreting them as fixed point decimal numbers.
	 */
	const divideDecimal = (x, y, unit = UNIT) => {
		const xBN = BN.isBN(x) ? x : new BN(x);
		const yBN = BN.isBN(y) ? y : new BN(y);
		return xBN.mul(unit).div(yBN);
	};

	/*
	 * Multiplies x and y interpreting them as fixed point decimal numbers,
	 * with rounding.
	 */
	const multiplyDecimalRound = (x, y) => {
		let result = x.mul(y).div(toUnit(0.1));
		if (result.mod(toBN(10)).gte(toBN(5))) {
			result = result.add(toBN(10));
		}
		return result.div(toBN(10));
	};

	/*
	 * Divides x and y interpreting them as fixed point decimal numbers,
	 * with rounding.
	 */
	const divideDecimalRound = (x, y) => {
		let result = x.mul(toUnit(10)).div(y);
		if (result.mod(toBN(10)).gte(toBN(5))) {
			result = result.add(toBN(10));
		}
		return result.div(toBN(10));
	};

	/*
	 * Exponentiation by squares of x^n, interpreting them as fixed point decimal numbers.
	 */
	const powerToDecimal = (x, n, unit = UNIT) => {
		let xBN = BN.isBN(x) ? x : new BN(x);
		let temp = unit;
		while (n > 0) {
			if (n % 2 !== 0) {
				temp = temp.mul(xBN).div(unit);
			}
			xBN = xBN.mul(xBN).div(unit);
			n = parseInt(n / 2);
		}
		return temp;
	};

	/**
	 *  Convenience method to assert that an event matches a shape
	 *  @param actualEventOrTransaction The transaction receipt, or event as returned in the event logs from web3
	 *  @param expectedEvent The event name you expect
	 *  @param expectedArgs The args you expect in object notation, e.g. { newOracle: '0x...', updatedAt: '...' }
	 */
	const assertEventEqual = (actualEventOrTransaction, expectedEvent, expectedArgs) => {
		// If they pass in a whole transaction we need to extract the first log, otherwise we already have what we need
		const event = Array.isArray(actualEventOrTransaction.logs)
			? actualEventOrTransaction.logs[0]
			: actualEventOrTransaction;

		if (!event) {
			assert.fail(new Error('No event was generated from this transaction'));
		}

		// Assert the names are the same.
		assert.strictEqual(event.event, expectedEvent);

		assertDeepEqual(event.args, expectedArgs);
		// Note: this means that if you don't assert args they'll pass regardless.
		// Ensure you pass in all the args you need to assert on.
	};

	/**
	 * Converts a hex string of bytes into a UTF8 string with \0 characters (from padding) removed
	 */
	const bytesToString = bytes => {
		const result = hexToAscii(bytes);
		return result.replace(/\0/g, '');
	};

	const assertEventsEqual = (transaction, ...expectedEventsAndArgs) => {
		if (expectedEventsAndArgs.length % 2 > 0)
			throw new Error('Please call assert.eventsEqual with names and args as pairs.');
		if (expectedEventsAndArgs.length <= 2)
			throw new Error(
				"Expected events and args can be called with just assert.eventEqual as there's only one event."
			);

		for (let i = 0; i < expectedEventsAndArgs.length; i += 2) {
			const log = transaction.logs[Math.floor(i / 2)];

			assert.strictEqual(log.event, expectedEventsAndArgs[i], 'Event name mismatch');
			assertDeepEqual(log.args, expectedEventsAndArgs[i + 1], 'Event args mismatch');
		}
	};

	/**
	 *  Convenience method to assert that two BN.js instances are equal.
	 *  @param actualBN The BN.js instance you received
	 *  @param expectedBN The BN.js amount you expected to receive
	 *  @param context The description to log if we fail the assertion
	 */
	const assertBNEqual = (actualBN, expectedBN, context) => {
		assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
	};

	/**
	 *  Convenience method to assert that two BN.js instances are NOT equal.
	 *  @param actualBN The BN.js instance you received
	 *  @param expectedBN The BN.js amount you expected NOT to receive
	 *  @param context The description to log if we fail the assertion
	 */
	const assertBNNotEqual = (actualBN, expectedBN) => {
		assert.notStrictEqual(actualBN.toString(), expectedBN.toString(), context);
	};

	/**
	 *  Convenience method to assert that two BN.js instances are within 100 units of each other.
	 *  @param actualBN The BN.js instance you received
	 *  @param expectedBN The BN.js amount you expected to receive, allowing a varience of +/- 100 units
	 */
	const assertBNClose = (actualBN, expectedBN, varianceParam = '10') => {
		const actual = BN.isBN(actualBN) ? actualBN : new BN(actualBN);
		const expected = BN.isBN(expectedBN) ? expectedBN : new BN(expectedBN);
		const variance = BN.isBN(varianceParam) ? varianceParam : new BN(varianceParam);
		const actualDelta = expected.sub(actual).abs();

		assert.ok(
			actual.gte(expected.sub(variance)),
			`Number is too small to be close (Delta between actual and expected is ${actualDelta.toString()}, but variance was only ${variance.toString()}`
		);
		assert.ok(
			actual.lte(expected.add(variance)),
			`Number is too large to be close (Delta between actual and expected is ${actualDelta.toString()}, but variance was only ${variance.toString()})`
		);
	};

	/**
	 *  Convenience method to assert that the value of left operand is greater than then value of the right operand
	 *  @param aBN The left operand BN.js instance
	 *  @param bBN The right operand BN.js instance
	 */
	const assertBNGreaterThan = (aBN, bBN) => {
		assert.ok(aBN.gt(bBN), `${aBN.toString()} is not greater than ${bBN.toString()}`);
	};

	/**
	 *  Convenience method to assert that the value of left operand is greater than or equal then value of the right operand
	 *  @param aBN The left operand BN.js instance
	 *  @param bBN The right operand BN.js instance
	 */
	const assertBNGreaterEqualThan = (aBN, bBN) => {
		assert.ok(aBN.gte(bBN), `${aBN.toString()} is not greater than or equal to ${bBN.toString()}`);
	};

	/**
	 *  Convenience method to assert that the value of left operand is less than then value of the right operand
	 *  @param aBN The left operand BN.js instance
	 *  @param bBN The right operand BN.js instance
	 */
	const assertBNLessThan = (aBN, bBN) => {
		assert.ok(aBN.lt(bBN), `${aBN.toString()} is not less than ${bBN.toString()}`);
	};

	/**
	 *  Convenience method to assert that the value of left operand is less than then value of the right operand
	 *  @param aBN The left operand BN.js instance
	 *  @param bBN The right operand BN.js instance
	 */
	const assertBNLessEqualThan = (aBN, bBN) => {
		assert.ok(aBN.lte(bBN), `${aBN.toString()} is not less than or equal to ${bBN.toString()}`);
	};

	/**
	 *  Convenience method to assert that two objects or arrays which contain nested BN.js instances are equal.
	 *  @param actual What you received
	 *  @param expected The shape you expected
	 */
	const assertDeepEqual = (actual, expected, context) => {
		// Check if it's a value type we can assert on straight away.
		if (BN.isBN(actual) || BN.isBN(expected)) {
			assertBNEqual(actual, expected, context);
		} else if (
			typeof expected === 'string' ||
			typeof actual === 'string' ||
			typeof expected === 'number' ||
			typeof actual === 'number' ||
			typeof expected === 'boolean' ||
			typeof actual === 'boolean'
		) {
			assert.strictEqual(actual, expected, context);
		}
		// Otherwise dig through the deeper object and recurse
		else if (Array.isArray(expected)) {
			for (let i = 0; i < expected.length; i++) {
				assertDeepEqual(actual[i], expected[i], `(array index: ${i}) `);
			}
		} else {
			for (const key of Object.keys(expected)) {
				assertDeepEqual(actual[key], expected[key], `(key: ${key}) `);
			}
		}
	};

	/**
	 *  Convenience method to assert that an amount of ether (or other 10^18 number) was received from a contract.
	 *  @param actualWei The value retrieved from a smart contract or wallet in wei
	 *  @param expectedAmount The amount you expect e.g. '1'
	 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
	 */
	const assertUnitEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
		assertBNEqual(actualWei, toWei(expectedAmount, expectedUnit));
	};

	/**
	 *  Convenience method to assert that an amount of ether (or other 10^18 number) was NOT received from a contract.
	 *  @param actualWei The value retrieved from a smart contract or wallet in wei
	 *  @param expectedAmount The amount you expect NOT to be equal to e.g. '1'
	 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
	 */
	const assertUnitNotEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
		assertBNNotEqual(actualWei, toWei(expectedAmount, expectedUnit));
	};

	/**
	 * Convenience method to assert that the return of the given block when invoked or promise causes a
	 * revert to occur, with an optional revert message.
	 * @param blockOrPromise The JS block (i.e. function that when invoked returns a promise) or a promise itself
	 * @param reason Optional reason string to search for in revert message
	 */
	const assertRevert = async (blockOrPromise, reason) => {
		let errorCaught = false;
		try {
			const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
			await result;
		} catch (error) {
			assert.include(error.message, 'revert');
			if (reason) {
				assert.include(error.message, reason);
			}
			errorCaught = true;
		}

		assert.strictEqual(errorCaught, true, 'Operation did not revert as expected');
	};

	const assertInvalidOpcode = async blockOrPromise => {
		let errorCaught = false;
		try {
			const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
			await result;
		} catch (error) {
			assert.include(error.message, 'invalid opcode');
			errorCaught = true;
		}

		assert.strictEqual(
			errorCaught,
			true,
			'Operation did not cause an invalid opcode error as expected'
		);
	};

	/**
	 *  Gets the ETH balance for the account address
	 * 	@param account Ethereum wallet address
	 */
	const getEthBalance = account => web3.eth.getBalance(account);

	const loadLocalUsers = () => {
		return normalizeHardhatNetworkAccountsConfig(accounts).map(({ privateKey }) => ({
			private: privateKey,
			public: web3.eth.accounts.privateKeyToAccount(privateKey).address,
		}));
	};

	const isCompileRequired = () => {
		// get last modified sol file
		const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

		// get last build
		const { earliestCompiledTimestamp } = loadCompiledFiles({ buildPath });

		return latestSolTimestamp > earliestCompiledTimestamp;
	};

	// create a factory to deploy mock price aggregators
	const createMockAggregatorFactory = async account => {
		const { compiled } = loadCompiledFiles({ buildPath });
		const {
			abi,
			evm: {
				bytecode: { object: bytecode },
			},
		} = compiled['MockAggregatorV2V3'];
		return new ethers.ContractFactory(abi, bytecode, account);
	};

	const setupProvider = ({ providerUrl, privateKey, publicKey }) => {
		const provider = new ethers.providers.JsonRpcProvider(providerUrl);

		let wallet;
		if (publicKey) {
			wallet = provider.getSigner(publicKey);
			wallet.address = publicKey;
		} else {
			wallet = new ethers.Wallet(privateKey || ethers.Wallet.createRandom().privateKey, provider);
		}

		return {
			provider,
			wallet: wallet || undefined,
		};
	};

	const getContract = ({
		contract,
		source = contract,
		network = 'mainnet',
		useOvm = false,
		deploymentPath = undefined,
		wallet,
		provider,
	}) => {
		const target = getTarget({ path, fs, contract, network, useOvm, deploymentPath });
		const sourceData = getSource({
			path,
			fs,
			contract: source,
			network,
			useOvm,
			deploymentPath,
		});

		return new ethers.Contract(target.address, sourceData.abi, wallet || provider);
	};

	return {
		mineBlock,
		fastForward,
		fastForwardTo,
		takeSnapshot,
		restoreSnapshot,
		currentTime,
		multiplyDecimal,
		divideDecimal,
		multiplyDecimalRound,
		divideDecimalRound,
		powerToDecimal,

		toUnit,
		fromUnit,

		toPreciseUnit,
		fromPreciseUnit,

		assertEventEqual,
		assertEventsEqual,
		assertBNEqual,
		assertBNNotEqual,
		assertBNClose,
		assertBNGreaterThan,
		assertBNGreaterEqualThan,
		assertBNLessThan,
		assertBNLessEqualThan,
		assertDeepEqual,
		assertInvalidOpcode,
		assertUnitEqual,
		assertUnitNotEqual,
		assertRevert,

		getEthBalance,
		bytesToString,

		loadLocalUsers,
		isCompileRequired,
		createMockAggregatorFactory,

		setupProvider,
		getContract,
	};
};
