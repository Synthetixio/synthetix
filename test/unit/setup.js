'use strict';

const SafeDecimalMath = artifacts.require('SafeDecimalMath');

const { toBytes32 } = require('../../');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const setupContract = async ({ accounts, contract, args = [] }) => {
	const [deployerAccount, owner, oracle] = accounts;

	const artifact = artifacts.require(contract);

	const linkSafeDecimalMath = async () => {
		return artifact.link(await SafeDecimalMath.new());
	};

	const create = ({ constructorArgs }) => {
		return artifact.new(...constructorArgs.concat({ from: deployerAccount }));
	};

	// const constructorArgs = args.length > 0 ? args : undefined;

	try {
		await linkSafeDecimalMath();
	} catch (err) {
		// Ignore as we may not need library linkage
	}

	const defaultArgs = {
		ExchangeRates: [oracle, [toBytes32('SNX')], [web3.utils.toWei('0.2', 'ether')]],
		SynthetixState: [owner, ZERO_ADDRESS],
		SupplySchedule: [owner, 0, 0],
		ProxyERC20: [owner],
	};

	return create({ constructorArgs: args.length > 0 ? args : defaultArgs[contract] });
};

const setupAllContracts = async ({ accounts, contracts }) => {
	const returnObj = {};

	// ordered by dependency
	const contractsToFetch = [
		{ contract: 'ExchangeRates', returnVal: 'exchangeRates' },
		{ contract: 'SynthetixState', returnVal: 'synthetixState' },
		{ contract: 'SupplySchedule', returnVal: 'supplySchedule' },
		{ contract: 'ProxyERC20', returnVal: 'synthetixProxy' },
	]
		// remove contracts not needed
		.filter(({ contract }) => contracts.indexOf(contract) > -1);

	// do this in serial in case we have deps we need to load
	for (const { contract, returnVal } of contractsToFetch) {
		returnObj[returnVal] = await setupContract({ accounts, contract });
	}

	return returnObj;
};

module.exports = {
	setupContract,
	setupAllContracts,
};
