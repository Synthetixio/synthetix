const ethers = require('ethers');
const { getUsers } = require('../../../index');

async function loadUsers({ ctx, network }) {
	let wallets = [];

	// Retrieve and create wallets
	if (ctx.fork) {
		wallets = wallets.concat(_getWallets({ provider: ctx.provider }));
	}
	wallets = wallets.concat(_createWallets({ provider: ctx.provider }));

	// Build ctx.users
	ctx.users = {};
	ctx.users.owner = wallets[0];
	ctx.users.someUser = wallets[1];
	ctx.users.otherUser = wallets[2];
	ctx.users.wallets = wallets; // TODO(liamz)
	for (let i = 3; i < wallets.length; i++) {
		ctx.users[`user${i}`] = wallets[i];
	}
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
