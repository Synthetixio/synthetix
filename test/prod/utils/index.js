const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const { getEther, getSNX, getsUSD } = require('./getTokens');
const { exchangeSynths } = require('./exchangeSynths');
const { readSetting } = require('./systemSettings');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	getEther,
	getsUSD,
	getSNX,
	exchangeSynths,
	readSetting,
};
