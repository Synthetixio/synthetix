const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const assert = require('assert');
const { ensureNetwork, loadConnections, confirmAction } = require('../util');
const { wrap } = require('../../..');

const migrateBridge = async ({ network, useFork, gasPrice, useMigrator }) => {
	const { signer, getUsers, getTarget, getSource, txParams } = await _connect({
		network,
		useFork,
		gasPrice,
	});
	const {
		deployer,
		snxContract,
		oldBridgeContract,
		newBridgeContract,
		newEscrowContract,
	} = _identify({
		network,
		signer,
		getUsers,
		getSource,
		getTarget,
	});

	const { migratorContract } = await _deploy({
		network,
		useMigrator,
		signer,
		newBridgeContract,
		newEscrowContract,
		txParams,
	});
	await _verify({
		migratorContract,
		snxContract,
		oldBridgeContract,
		newBridgeContract,
		newEscrowContract,
	});

	await _nominate({
		migratorContract,
		deployer,
		oldBridgeContract,
		newEscrowContract,
	});

	await _execute({
		signer,
		migratorContract,
		txParams,
		oldBridgeContract,
		newEscrowContract,
	});

	await _validate({ snxContract, newEscrowContract, oldBridgeContract });
};

async function _connect({ network, useFork, gasPrice }) {
	ensureNetwork(network);
	console.log(chalk.gray(`Network: ${network}${useFork ? '(FORKED)' : ''}`));

	if (useFork && network !== 'mainnet') {
		throw new Error('Command can only run on a fork if network is mainnet');
	}

	const { providerUrl, privateKey } = loadConnections({
		network,
		useFork,
	});
	console.log(chalk.gray(`Provider: ${providerUrl}`));

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const { getUsers, getTarget, getSource } = wrap({ network, fs, path });

	let signer;
	if (useFork && !privateKey) {
		signer = provider.getSigner(getUsers({ network }).find(u => u.name === 'deployer').address);
	} else {
		signer = new ethers.Wallet(privateKey, provider);
	}
	console.log(chalk.gray(`Signer: ${await signer.getAddress()}`));

	const txParams = {
		gasPrice: ethers.utils.parseUnits(`${gasPrice}`, 'gwei'),
		gasLimit: 12000000,
	};
	console.log(chalk.gray(`Gas price: ${gasPrice} gwei (${txParams.gasPrice.toString()} wei)`));
	console.log(chalk.gray(`Gas limit: ${txParams.gasLimit}`));

	return {
		signer,
		getUsers,
		getTarget,
		getSource,
		txParams,
	};
}

function _identify({ network, getUsers, getSource, getTarget, signer }) {
	const users = getUsers({ network });

	const deployer = users.find(u => u.name === 'deployer').address;
	const pdao = users.find(u => u.name === 'owner').address;
	console.log(chalk.gray(`Deployer: ${deployer}`));
	console.log(chalk.gray(`pDAO: ${pdao}`));

	const snx = getTarget({ network, contract: 'ProxyERC20' }).address;
	const newBridge = getTarget({ network, contract: 'SynthetixBridgeToOptimism' }).address;
	const newEscrow = getTarget({ network, contract: 'SynthetixBridgeEscrow' }).address;
	console.log(chalk.gray(`Synthetix: ${snx}`));
	console.log(chalk.gray(`New bridge: ${newBridge}`));
	console.log(chalk.gray(`New escrow: ${newEscrow}`));

	let oldBridge;
	if (network === 'mainnet') {
		oldBridge = '0x045e507925d2e05D114534D0810a1abD94aca8d6';
	} else if (network === 'kovan') {
		oldBridge = '0xE8Bf8fe5ce9e15D30F478E1647A57CB6B0271228';
	} else {
		throw new Error('Unsupported network');
	}
	console.log(chalk.gray(`Old bridge: ${oldBridge}`));

	assert(newBridge !== oldBridge, 'Bridge addresses must be different');

	const oldBridgeContract = new ethers.Contract(
		oldBridge,
		getSource({ contract: 'SynthetixBridgeToOptimism' }).abi, // We only care about the Owned interface here, so the new ABI will do
		signer
	);

	const newBridgeContract = new ethers.Contract(
		newBridge,
		getSource({ contract: 'SynthetixBridgeToOptimism' }).abi,
		signer
	);

	const newEscrowContract = new ethers.Contract(
		newEscrow,
		getSource({ contract: 'SynthetixBridgeEscrow' }).abi,
		signer
	);

	const snxContract = new ethers.Contract(snx, getSource({ contract: 'ProxyERC20' }).abi, signer);

	return {
		snx,
		deployer,
		oldBridgeContract,
		newBridgeContract,
		newEscrowContract,
		snxContract,
	};
}

async function _deploy({
	network,
	useMigrator,
	newBridgeContract,
	newEscrowContract,
	txParams,
	signer,
}) {
	const artifacts = JSON.parse(
		fs.readFileSync('build/artifacts/contracts/BridgeMigrator.sol/BridgeMigrator.json')
	);

	let migratorContract;
	if (!useMigrator) {
		await confirmAction(chalk.yellow('Type "y" to deploy the migrator contract'));

		console.log(chalk.gray('Deploying BridgeMigrator...'));

		const Migrator = new ethers.ContractFactory(artifacts.abi, artifacts.bytecode, signer);
		migratorContract = await Migrator.deploy(
			newBridgeContract.address,
			newEscrowContract.address,
			network,
			txParams
		);

		const tx = migratorContract.deployTransaction;
		console.log(chalk.gray(tx.hash));
		const receipt = await migratorContract.deployTransaction.wait();
		console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
	} else {
		migratorContract = new ethers.Contract(useMigrator, artifacts.abi, signer);
	}

	console.log(chalk.gray(`Migrator: ${migratorContract.address}`));

	return {
		migratorContract,
	};
}

async function _verify({
	migratorContract,
	snxContract,
	oldBridgeContract,
	newBridgeContract,
	newEscrowContract,
}) {
	console.log(chalk.gray('Validating contract parameters...'));

	const _snx = await migratorContract.snx();
	const _oldBridge = await migratorContract.oldBridge();
	const _newBridge = await migratorContract.newBridge();
	const _newEscrow = await migratorContract.newEscrow();

	assert(_snx === snxContract.address, 'Unexpected snx address');
	assert(_oldBridge === oldBridgeContract.address, 'Unexpected old bridge address');
	assert(_newBridge === newBridgeContract.address, 'Unexpected new bridge address');
	assert(_newEscrow === newEscrowContract.address, 'Unexpected new escrow address');

	console.log(chalk.gray(`Contract's snx: ${_snx} OK ✓`));
	console.log(chalk.gray(`Contract's old bridge: ${_oldBridge} OK ✓`));
	console.log(chalk.gray(`Contract's new bridge: ${_newBridge} OK ✓`));
	console.log(chalk.gray(`Contract's new escrow: ${_newEscrow} OK ✓`));
}

async function _nominate({ migratorContract, deployer, oldBridgeContract, newEscrowContract }) {
	const oldBridgeNominatedOwner = await oldBridgeContract.nominatedOwner();
	console.log(chalk.gray(`Old bridge nominatedOwner: ${oldBridgeNominatedOwner}`));
	if (oldBridgeNominatedOwner !== migratorContract.address) {
		const oldBridgeOwner = await oldBridgeContract.owner();
		console.log(chalk.gray(`Old bridge owner: ${oldBridgeOwner}`));
		if (oldBridgeOwner === deployer) {
			console.log(
				chalk.gray(
					`Nominating new owner on SynthetixBridgeToOptimism (${oldBridgeContract.address})...`
				)
			);
			const tx = await oldBridgeContract.nominateNewOwner(migratorContract.address);
			console.log(chalk.gray(tx.hash));
			const receipt = await tx.wait();
			console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
		} else {
			await confirmAction(
				chalk.yellow(
					`Please nominate SynthetixBridgeToOptimism (${oldBridgeContract.address}) ownership to ${migratorContract.address}\nWhen done, press "y" to continue.`
				)
			);
		}
	}

	const newEscrowNominatedOwner = await newEscrowContract.nominatedOwner();
	console.log(chalk.gray(`New escrow nominatedOwner: ${newEscrowNominatedOwner}`));
	if (newEscrowNominatedOwner !== migratorContract.address) {
		const newEscrowOwner = await newEscrowContract.owner();
		console.log(chalk.gray(`New escrow owner: ${newEscrowOwner}`));
		if (newEscrowOwner === deployer) {
			console.log(
				chalk.gray(
					`Nominating new owner on SynthetixBridgeEscrow (${newEscrowContract.address})...`
				)
			);
			const tx = await newEscrowContract.nominateNewOwner(migratorContract.address);
			console.log(chalk.gray(tx.hash));
			const receipt = await tx.wait();
			console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
		} else {
			await confirmAction(
				chalk.yellow(
					`Please nominate SynthetixBridgeEscrow (${newEscrowContract.address}) ownership to ${migratorContract.address}\nWhen done, press "y" to continue.`
				)
			);
		}
	}
}

async function _execute({ migratorContract, txParams, oldBridgeContract, newEscrowContract }) {
	await confirmAction(chalk.yellow.inverse('Execute the migration? (type "y" to continue)'));

	console.log(chalk.gray.bold('Executing...'));

	let tx, receipt;

	tx = await migratorContract.execute(txParams);
	console.log(chalk.gray(tx.hash));
	receipt = await tx.wait();
	console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));

	tx = await oldBridgeContract.acceptOwnership();
	console.log(chalk.gray(tx.hash));
	receipt = await tx.wait();
	console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));

	tx = await newEscrowContract.acceptOwnership();
	console.log(chalk.gray(tx.hash));
	receipt = await tx.wait();
	console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
}

async function _validate({ snxContract, newEscrowContract, oldBridgeContract }) {
	console.log(
		chalk.gray(`Old bridge SNX balance: ${await snxContract.balanceOf(oldBridgeContract.address)}`)
	);
	console.log(
		chalk.gray(`New escrow SNX balance: ${await snxContract.balanceOf(newEscrowContract.address)}`)
	);
	console.log(chalk.gray(`Old bridge owner: ${await oldBridgeContract.owner()}`));
	console.log(chalk.gray(`New escrow owner: ${await newEscrowContract.owner()}`));
}

module.exports = {
	migrateBridge,
	cmd: program =>
		program
			.command('migrate-bridge')
			.description(
				'Migrates a SynthetixBridgeToOptimism (v1) to a SynthetixBridgeToOptimism + SynthetixBridgeEscrow (v2) via a BridgeMigrator contract.'
			)
			.option('--network <value>', 'The target network', network => network.toLowerCase())
			.option('--use-fork', 'Run the migration on a fork of mainnet', false)
			.option(
				'--gas-price <value>',
				'Gas price in GWEI to use in all transactions',
				parseFloat,
				100
			)
			.option('--use-migrator <value>', 'Use already deployed migrator contract')
			.action(async (...args) => {
				try {
					await migrateBridge(...args);
				} catch (err) {
					console.error(chalk.red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
