const { connectContract } = require('./connectContract');
const { web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

async function getEther({ amount, account, provider }) {
	const balance = toBN(await web3.eth.getBalance(provider));
	if (balance.lt(amount)) {
		throw new Error(
			`Account ${provider} only has ${balance} ETH and cannot transfer ${amount} ETH to ${account} `
		);
	}

	await web3.eth.sendTransaction({
		from: provider,
		to: account,
		value: amount,
	});
}

async function getSNX({ network, amount, account, provider }) {
	const SNX = await connectContract({ network, contractName: 'ProxyERC20' });

	const balance = toBN(await SNX.balanceOf(provider));
	if (balance.lt(amount)) {
		throw new Error(
			`Account ${provider} only has ${balance} SNX and cannot transfer ${amount} SNX to ${account} `
		);
	}

	await SNX.transfer(account, amount, {
		from: provider,
	});
}

async function getsUSD({ network, amount, account, provider }) {
	const sUSD = await connectContract({ network, contractName: 'SynthsUSD', abiName: 'Synth' });

	const balance = toBN(await sUSD.balanceOf(provider));
	if (balance.lt(amount)) {
		const snxToTransfer = amount.mul(toBN('10'));
		await getSNX({ network, account, amount: snxToTransfer, provider });

		const Synthetix = await connectContract({
			network,
			contractName: 'ProxyERC20',
			abiName: 'Synthetix',
		});

		await Synthetix.issueSynths(amount, {
			from: account,
		});
	} else {
		await sUSD.transfer(account, amount);
	}
}

module.exports = {
	getEther,
	getsUSD,
	getSNX,
};
