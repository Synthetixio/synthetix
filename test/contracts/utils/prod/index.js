const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./getContract');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
};
