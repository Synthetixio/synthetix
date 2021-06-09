const ethers = require('ethers');
const { getUsers } = require('../../../index');
const { loadLocalWallets } = require('../../test-utils/wallets');

async function loadUsers({ ctx, network }) {
	let wallets = [];

	// Retrieve and create wallets
	if (ctx.fork) {
		wallets = wallets.concat(_getWallets({ provider: ctx.provider }));
	}
	wallets = wallets.concat(loadLocalWallets({ provider: ctx.provider }));

	// Build ctx.users
	ctx.users = {};
	ctx.users.owner = wallets[0];
	ctx.users.someUser = wallets[1];
	ctx.users.otherUser = wallets[2];
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

module.exports = {
	loadUsers,
};
