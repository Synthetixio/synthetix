const { getUsers } = require('../../../index');
const { loadLocalWallets } = require('../../test-utils/wallets');

async function loadUsers({ ctx }) {
	ctx.users = {};
	let wallets = [];

	// Retrieve and create wallets
	wallets = wallets.concat(loadLocalWallets({ provider: ctx.provider }));

	// Build ctx.users
	ctx.users.owner = wallets[0];
	ctx.users.deployer = wallets[0];
	ctx.users.someUser = wallets[1];
	ctx.users.otherUser = wallets[2];
	for (let i = 3; i < wallets.length; i++) {
		ctx.users[`user${i}`] = wallets[i];
	}

	if (ctx.fork) {
		ctx.users = { ...ctx.users, ..._getWallets({ ctx, provider: ctx.provider }) };
	}
}

function _getWallets({ ctx, provider }) {
	const usersArray = getUsers(ctx);

	const usersObj = {};
	for (const user of usersArray) {
		usersObj[user.name] = provider.getSigner(user.address);
		usersObj[user.name].address = user.address;
	}

	return usersObj;
}

module.exports = {
	loadUsers,
};
