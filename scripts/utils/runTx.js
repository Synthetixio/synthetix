const { green, red } = require('chalk');
const ethers = require('ethers');

async function runTx(tx, provider) {
	try {
		const receipt = await tx.wait();

		console.log(green('Tx executed:'), receipt);

		return receipt;
	} catch (e) {
		const code = await provider.call(tx);

		console.log(red('Tx reverted:'), ethers.utils.parseBytes32String(`0x${code.substr(138)}`));

		return false;
	}
}

module.exports = {
	runTx,
};
