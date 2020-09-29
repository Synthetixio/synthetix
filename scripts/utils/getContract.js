const synthetix = require("../..");
const bre = require("@nomiclabs/buidler");

const { gray } = require('chalk');

async function getContract({
	contract,
	abi = contract,
	network = 'mainnet',
	useOvm = false,
	wallet,
	provider,
}) {
  const target = synthetix.getTarget({ contract, network, useOvm });
	console.log(gray(`  getContract '${contract}' => ${target.address}`));
  const source = synthetix.getSource({ contract: abi, network, useOvm });

  return new bre.ethers.Contract(
    target.address,
    source.abi,
    wallet || provider
  );
}

module.exports = {
	getContract,
};
