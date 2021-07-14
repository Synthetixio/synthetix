const { types, task, subtask } = require('hardhat/config');
const { gray, yellow } = require('chalk');
const snx = require('../../index');
const { toBytes32 } = require('../../index');

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const {
	getSource,
	getTarget,
	constants: { ZERO_ADDRESS },
} = require('../../index');

function connectContracts({ ctx }) {
	const { useOvm } = ctx;
	const network = ctx.fork ? 'mainnet' : 'local';

	const allTargets = getTarget({ fs, path, network, useOvm });

	ctx.contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		ctx.contracts[name] = new ethers.Contract(
			getTarget({ fs, path, network, useOvm, contract: name }).address,
			getSource({ fs, path, network, useOvm, contract: target.source }).abi,
			ctx.provider
		);
	});
}

async function _getSNXForOwnerOnL2ByHackMinting({ ctx, amount }) {
	const owner = ctx.users.owner;

	let { Synthetix, AddressResolver } = ctx.contracts;

	const bridgeName = toBytes32('SynthetixBridgeToBase');
	let bridgeAddress = ZERO_ADDRESS;
	try {
		bridgeAddress = await AddressResolver.getAddress(bridgeName);
	} catch (ex) {}
	console.log(1);

	let tx;
	AddressResolver = AddressResolver.connect(owner);
	tx = await AddressResolver.importAddresses([bridgeName], [owner.address]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([Synthetix.address]);
	await tx.wait();

	Synthetix = Synthetix.connect(owner);
	tx = await Synthetix.mintSecondary(owner.address, amount);
	await tx.wait();

	tx = await AddressResolver.importAddresses([bridgeName], [bridgeAddress]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([Synthetix.address]);
	await tx.wait();
}

function _setupProvider({ url }) {
	return new ethers.providers.JsonRpcProvider({
		url,
		pollingInterval: 50,
		timeout: 600000,
	});
}

const { loadUsers } = require('../../test/integration/utils/users');

task('bootstrap-local-l2')
	.addOptionalParam('account', 'The account to fund with SNX')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { account } = taskArguments;
		console.log(`Funding account ${yellow(account)}`);

		const ctx = {};
		ctx.network = 'local';
		ctx.useOvm = false;

		ctx.provider = _setupProvider({ url: `http://localhost:8545` });

		loadUsers({ ctx });

		connectContracts({ ctx });

		_getSNXForOwnerOnL2ByHackMinting({ ctx, amount: ethers.utils.parseEther('5000000') });
	});
