const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const { ensureAccountHasEther, ensureAccountHasSNX, ensureAccountHassUSD } = require('./getTokens');
const { exchangeSynths } = require('./exchangeSynths');
const { readSetting, writeSetting } = require('./systemSettings');
const { skipWaitingPeriod, skipStakeTime } = require('./skipWaiting');
const { bootstrapLocal } = require('./bootstrapLocal');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	exchangeSynths,
	readSetting,
	writeSetting,
	skipWaitingPeriod,
	skipStakeTime,
	bootstrapLocal,
};
