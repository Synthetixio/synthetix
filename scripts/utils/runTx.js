const bre = require("@nomiclabs/buidler");

async function runTx(tx, provider) {
  try {
    const receipt = await tx.wait();

    console.log('Tx executed:', receipt);

    return true;
  } catch (e) {
    const code = await provider.call(tx);

    console.log(
      'Tx reverted:',
      bre.ethers.utils.parseBytes32String(`0x${code.substr(138)}`)
    );

    return false;
  }
}

module.exports = {
	runTx,
};
