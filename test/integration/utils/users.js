const ethers = require('ethers');

function loadUsers({ ctx }) {
	ctx.users = [];

	for (let i = 0; i < 10; i++) {
		const wallet = new ethers.Wallet(getPrivateKey({ index: i }), ctx.provider);

		ctx.users.push(wallet);
	}

	ctx.owner = ctx.users[0];
	ctx.user = ctx.users[1];
}

function getPrivateKey({ index }) {
	const masterNode = ethers.utils.HDNode.fromMnemonic(
		'test test test test test test test test test test test junk' // Default hardhat mnemonic
	);

	return masterNode.derivePath(`m/44'/60'/0'/0/${index}`).privateKey;
}

module.exports = {
	loadUsers,
	getPrivateKey,
};
