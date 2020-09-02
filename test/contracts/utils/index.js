const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const { getEther, getSNX, getsUSD } = require('./getTokens');
const { exchangeSynths } = require('./exchangeSynths');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	getEther,
	getsUSD,
	getSNX,
	exchangeSynths,
};
