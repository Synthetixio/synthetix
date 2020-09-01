const { chainIdToNetwork } = require('../../../../index.js');
const { web3 } = require('@nomiclabs/buidler');

async function detectNetworkName() {
	const networkId = await web3.eth.net.getId();
	return chainIdToNetwork[`${networkId}`];
}

module.exports = {
	detectNetworkName,
};
