const synthetix = require("../..");
const bre = require("@nomiclabs/buidler");

const { gray } = require('chalk');

async function getContract({
	contract,
	abi = contract,
	network = 'mainnet',
	useOvm = false,
	wallet,
}) {
	console.log(gray(`  Getting contract '${contract}', with abi '${abi}', on network ${network} (ovm = ${useOvm})`));
  const target = synthetix.getTarget({ contract, network, useOvm });
	console.log(gray('    target address:', target.address));
  const source = synthetix.getSource({ contract: abi, network, useOvm });

  return new bre.ethers.Contract(
    target.address,
    source.abi,
    wallet
  );
}

module.exports = {
	getContract,
};
