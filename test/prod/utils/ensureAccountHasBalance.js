const fs = require('fs');
const path = require('path');
const { connectContract } = require('./connectContract');
const { web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;
const { wrap, toBytes32 } = require('../../..');

async function getUser({ network, deploymentPath, user }) {
	const { getUsers } = wrap({ network, fs, path });

	return getUsers({ network, deploymentPath, user }).address;
}

async function ensureAccountHasEther({ network, deploymentPath, amount, account }) {
	const fromAccount =
		network === 'mainnet'
			? // mainnet use wETH account, otherwise owner
			  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
			: await getUser({ network, deploymentPath, user: 'owner' });

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
	const fromAccount = await getUser({
		network,
		deploymentPath,
		user: network === 'mainnet' ? 'sDAO' : 'owner',
	});

	const SNX = await connectContract({ network, deploymentPath, contractName: 'ProxyERC20' });

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
	const fromAccount = await getUser({
		network,
		deploymentPath,
		user: network === 'mainnet' ? 'sDAO' : 'owner',
	});

	const sUSD = await connectContract({
		network,
		deploymentPath,
		contractName: 'SynthsUSD',
		abiName: 'Synth',
	});

	const balance = toBN(await sUSD.transferableSynths(fromAccount));
	if (balance.lt(amount)) {
		const snxToTransfer = amount.mul(toBN('10'));
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
