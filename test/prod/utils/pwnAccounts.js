const { wrap } = require('../../..');
const fs = require('fs');
const path = require('path');
const { gray } = require('chalk');
const hre = require('hardhat');

const knownAccounts = [
	{
		name: 'binance', // Binance 8 Wallet
		address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
	},
];

async function pwnAccountsOnNetwork({ network }) {
	// Get Synthetix protocol users for the specified network
	const { getUsers } = wrap({ network, fs, path });
	const synthetixAccounts = getUsers({ network })
		.filter(account => account.name !== 'fee')
		.filter(account => account.name !== 'zero');

	// Combine all addresses
	const accounts = synthetixAccounts.concat(knownAccounts);

	// Request the rpc to unlock these accounts
	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];

		await _impersonateAccount(account.address);
	}

	return accounts;
}

async function _impersonateAccount(account) {
	console.log(gray(`  > Pwning ${account}`));

	await hre.network.provider.request({
		method: 'hardhat_impersonateAccount',
		params: [account],
	});
}

module.exports = {
	pwnAccountsOnNetwork,
	knownAccounts,
};
