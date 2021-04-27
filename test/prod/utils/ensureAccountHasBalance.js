const fs = require('fs');
const path = require('path');
const { connectContract } = require('./connectContract');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;
const { knownAccounts, wrap, toBytes32 } = require('../../..');
const { gray } = require('chalk');

const knownMainnetAccount = knownAccounts['mainnet'].find(a => a.name === 'binance').address;

function getUser({ network, deploymentPath, user }) {
	const { getUsers } = wrap({ network, deploymentPath, fs, path });

	return getUsers({ user }).address;
}

async function ensureAccountHasEther({ network, deploymentPath, amount, account }) {
	const currentBalance = web3.utils.toBN(await web3.eth.getBalance(account));
	if (currentBalance.gte(amount)) {
		return;
	}

	console.log(gray(`    > Ensuring ${account} has Ether...`));

	const fromAccount =
		network === 'mainnet'
			? knownMainnetAccount
			: getUser({ network, deploymentPath, user: 'owner' });

	const balance = toBN(await web3.eth.getBalance(fromAccount));
	if (balance.lt(amount)) {
		throw new Error(
			`Account ${fromAccount} only has ${balance} ETH and cannot transfer ${amount} ETH to ${account} `
		);
	}

	await web3.eth.sendTransaction({
		from: fromAccount,
		to: account,
		value: amount,
	});
}

async function ensureAccountHasSNX({ network, deploymentPath, amount, account }) {
	const SNX = await connectContract({ network, deploymentPath, contractName: 'ProxyERC20' });
	if ((await SNX.balanceOf(account)).gte(amount)) {
		return;
	}

	console.log(gray(`    > Ensuring ${account} has SNX...`));

	const fromAccount =
		network === 'mainnet'
			? knownMainnetAccount
			: getUser({
					network,
					deploymentPath,
					user: 'owner',
			  });

	const balance = toBN(await SNX.balanceOf(fromAccount));
	if (balance.lt(amount)) {
		throw new Error(
			`Account ${fromAccount} only has ${balance} SNX and cannot transfer ${amount} SNX to ${account} `
		);
	}

	await SNX.transfer(account, amount, {
		from: fromAccount,
	});
}

async function ensureAccountHassUSD({ network, deploymentPath, amount, account }) {
	const sUSD = await connectContract({
		network,
		deploymentPath,
		contractName: 'SynthsUSD',
		abiName: 'Synth',
	});
	if ((await sUSD.balanceOf(account)).gte(amount)) {
		return;
	}

	console.log(gray(`    > Ensuring ${account} has sUSD...`));

	const fromAccount =
		network === 'mainnet'
			? knownMainnetAccount
			: getUser({
					network,
					deploymentPath,
					user: 'owner',
			  });

	const balance = toBN(await sUSD.transferableSynths(fromAccount));
	const snxToTransfer = amount.mul(toBN(30));
	if (balance.lt(amount)) {
		await ensureAccountHasSNX({
			network,
			deploymentPath,
			account,
			amount: snxToTransfer,
		});

		const Synthetix = await connectContract({
			network,
			deploymentPath,
			contractName: 'ProxyERC20',
			abiName: 'Synthetix',
		});

		await Synthetix.issueSynths(amount, {
			from: account,
		});
	} else {
		await sUSD.transferAndSettle(account, amount, { from: fromAccount });
	}
}

async function ensureAccountHassETH({ network, deploymentPath, amount, account }) {
	const sETH = await connectContract({
		network,
		deploymentPath,
		contractName: 'SynthsETH',
		abiName: 'Synth',
	});
	if ((await sETH.balanceOf(account)).gte(amount)) {
		return;
	}

	console.log(gray(`    > Ensuring ${account} has sETH...`));

	const sUSDAmount = amount.mul(toBN('50'));
	await ensureAccountHassUSD({ network, deploymentPath, amount: sUSDAmount, account });

	const Synthetix = await connectContract({
		network,
		deploymentPath,
		contractName: 'ProxyERC20',
		abiName: 'Synthetix',
	});

	await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'), {
		from: account,
	});
}

module.exports = {
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHassETH,
	ensureAccountHasSNX,
};
