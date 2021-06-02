const ethers = require('ethers');
const { getUsers } = require('../../../index');

async function loadUsers({ ctx, network }) {
	let wallets;

	if (!ctx.fork) {
		wallets = _createWallets({ provider: ctx.provider });
	} else {
		wallets = _getWallets({ provider: ctx.provider });
	}

	ctx.users = {};
	ctx.users.owner = wallets[0];
	ctx.users.someUser = wallets[1];
}

function _getWallets({ provider }) {
	const users = getUsers({ network: 'mainnet' });

	const signers = users
		.filter(user => user.name !== 'fee')
		.filter(user => user.name !== 'zero')
		.map(user => {
			const signer = provider.getSigner(user.address);
			signer.address = signer._address;

			return signer;
		});

	return signers;
}

function _createWallets({ provider }) {
	const wallets = [];

	for (let i = 0; i < 10; i++) {
		wallets.push(new ethers.Wallet(getPrivateKey({ index: i }), provider));
	}

	return wallets;
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
