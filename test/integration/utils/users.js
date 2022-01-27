const ethers = require('ethers');
const { getUsers } = require('../../../index');
const { loadLocalWallets } = require('../../test-utils/wallets');

async function loadUsers({ ctx }) {
	ctx.users = {};
	let wallets = [];

	// Retrieve and create wallets
	wallets = wallets.concat(loadLocalWallets({ provider: ctx.provider }));

	// Build ctx.users
	ctx.users.owner = wallets[0];
	ctx.users.deployer = ctx.users.owner;
	ctx.users.someUser = wallets[1];
	ctx.users.otherUser = wallets[2];
	for (let i = 3; i < wallets.length; i++) {
		ctx.users[`user${i}`] = wallets[i];
	}

	if (ctx.fork) {
		ctx.users = { ...ctx.users, ..._getWallets({ ctx, provider: ctx.provider }) };
	} else if (ctx.useOvm) {
		// Here we set a default private key for local-ovm deployment, as the
		// OVM geth node has no notion of local/unlocked accounts.
		// Deploying without a private key will give the error "OVM: Unsupported RPC method",
		// as the OVM node does not support eth_sendTransaction, which inherently relies on
		// the unlocked accounts on the node.
		// Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
		const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

		ctx.users.owner = new ethers.Wallet(privateKey, ctx.provider);
		ctx.users.owner.address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
		ctx.users.deployer = ctx.users.owner;
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
