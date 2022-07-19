'use strict';

const fs = require('fs');
const ethers = require('ethers');
const { gray, green } = require('chalk');

const {
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadConnections,
	loadAndCheckRequiredSources,
} = require('../util');

const { getUsers } = require('../../..');

const liquidatorRewardsRestitution = async ({
	network,
	deploymentPath,
	privateKey,
	useOvm,
	useFork,
	providerUrl,
	csv,
	threshold,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
		useOvm,
	});

	const { deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	// if not specified, or in a local network, override the private key passed as a CLI option, with the one specified in .env
	if (network !== 'local' && !privateKey && !useFork) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	let signer;
	if (!privateKey) {
		const account = getUsers({ network, user: 'owner', useOvm }).address;
		signer = provider.getSigner(account);
		signer.address = await signer.getAddress();
	} else {
		signer = new ethers.Wallet(privateKey, provider);
	}

	console.log(gray(`Using account with public key ${signer.address}`));

	// Instantiate Synthetix contract
	const { address: synthetixAddress } = deployment.targets['Synthetix'];
	const { abi: synthetixABI } = deployment.sources[deployment.targets['Synthetix'].source];
	const Synthetix = new ethers.Contract(synthetixAddress, synthetixABI, signer);

	// Instantiate RewardEscrowV2 contract
	const { address: rewardEscrowV2Address } = deployment.targets['RewardEscrowV2'];
	const { abi: rewardEscrowABI } = deployment.sources[deployment.targets['RewardEscrowV2'].source];
	const RewardEscrowV2 = new ethers.Contract(rewardEscrowV2Address, rewardEscrowABI, signer);

	// Instantiate MultiCall contract
	const multiCallAddress = ''; // address
	const multiCallABI = [
		{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
		{
			anonymous: false,
			inputs: [
				{ indexed: false, internalType: 'address', name: 'oldOwner', type: 'address' },
				{ indexed: false, internalType: 'address', name: 'newOwner', type: 'address' },
			],
			name: 'OwnerChanged',
			type: 'event',
		},
		{
			anonymous: false,
			inputs: [{ indexed: false, internalType: 'address', name: 'newOwner', type: 'address' }],
			name: 'OwnerNominated',
			type: 'event',
		},
		{
			inputs: [],
			name: 'acceptOwnership',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
		{
			inputs: [
				{
					components: [
						{ internalType: 'address', name: 'target', type: 'address' },
						{ internalType: 'bool', name: 'allowFailure', type: 'bool' },
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct PrivateMulticall.Call3[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'aggregate3',
			outputs: [
				{
					components: [
						{ internalType: 'bool', name: 'success', type: 'bool' },
						{ internalType: 'bytes', name: 'returnData', type: 'bytes' },
					],
					internalType: 'struct PrivateMulticall.Result[]',
					name: 'returnData',
					type: 'tuple[]',
				},
			],
			stateMutability: 'payable',
			type: 'function',
		},
		{
			inputs: [
				{
					components: [
						{ internalType: 'address', name: 'target', type: 'address' },
						{ internalType: 'bool', name: 'allowFailure', type: 'bool' },
						{ internalType: 'uint256', name: 'value', type: 'uint256' },
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct PrivateMulticall.Call3Value[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'aggregate3Value',
			outputs: [
				{
					components: [
						{ internalType: 'bool', name: 'success', type: 'bool' },
						{ internalType: 'bytes', name: 'returnData', type: 'bytes' },
					],
					internalType: 'struct PrivateMulticall.Result[]',
					name: 'returnData',
					type: 'tuple[]',
				},
			],
			stateMutability: 'payable',
			type: 'function',
		},
		{
			inputs: [{ internalType: 'uint256', name: 'blockNumber', type: 'uint256' }],
			name: 'getBlockHash',
			outputs: [{ internalType: 'bytes32', name: 'blockHash', type: 'bytes32' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getBlockNumber',
			outputs: [{ internalType: 'uint256', name: 'blockNumber', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getChainId',
			outputs: [{ internalType: 'uint256', name: 'chainid', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getCurrentBlockCoinbase',
			outputs: [{ internalType: 'address', name: 'coinbase', type: 'address' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getCurrentBlockDifficulty',
			outputs: [{ internalType: 'uint256', name: 'difficulty', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getCurrentBlockGasLimit',
			outputs: [{ internalType: 'uint256', name: 'gaslimit', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getCurrentBlockTimestamp',
			outputs: [{ internalType: 'uint256', name: 'timestamp', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [{ internalType: 'address', name: 'addr', type: 'address' }],
			name: 'getEthBalance',
			outputs: [{ internalType: 'uint256', name: 'balance', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getLastBlockHash',
			outputs: [{ internalType: 'bytes32', name: 'blockHash', type: 'bytes32' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [{ internalType: 'address', name: '_owner', type: 'address' }],
			name: 'nominateNewOwner',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
		{
			inputs: [],
			name: 'nominatedOwner',
			outputs: [{ internalType: 'address', name: '', type: 'address' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'owner',
			outputs: [{ internalType: 'address', name: '', type: 'address' }],
			stateMutability: 'view',
			type: 'function',
		},
	];
	const MultiCall = new ethers.Contract(multiCallAddress, multiCallABI, signer);

	// Parse the csv file to get the revelant accounts
	const csvAsString = fs.readFileSync(csv).toString('utf8');
	const csvObjects = await csvToJSON(csvAsString);
	const filteredObjects = [];
	csvObjects
		.filter(v => v)
		.forEach(obj => {
			if (
				obj.escrow !== undefined &&
				ethers.BigNumber.from(obj.escrow).gt(ethers.utils.parseEther(threshold))
			) {
				filteredObjects.push(obj);
			}
		});

	try {
		// Note: make sure to do token approvals first
		console.log('approving...');

		const txns = [
			Synthetix.populateTransaction.approve('', ethers.constants.MaxUint256),
			Synthetix.populateTransaction.approve(rewardEscrowV2Address, ethers.constants.MaxUint256),
		];
		await readMulticall(
			txns,
			v => v,
			() => {},
			0,
			1
		);

		console.log('approvals done.');

		console.log('creating escrow entries for', filteredObjects.length, 'addresses');

		// Create escrow entries for each account using multicall
		// eslint-disable-next-line new-cap
		let totalAmountEscrowed = new ethers.BigNumber.from(0);
		await readMulticall(
			filteredObjects,
			a =>
				RewardEscrowV2.populateTransaction.createEscrowEntry(
					a.address,
					ethers.BigNumber.from(a.escrow),
					31536000 // 1 year in seconds
				),
			(a, r) => {
				totalAmountEscrowed = totalAmountEscrowed.add(ethers.BigNumber.from(a.escrow));
			},
			0,
			50
		);

		console.log(green('Completed! \n Total amount escrowed:', totalAmountEscrowed.toString()));
	} catch (error) {
		console.log('Error!', error);
	}

	// Multicall function definition
	async function readMulticall(items, call, onResult, write = 0, batch = 500) {
		const results = [];
		for (let i = 0; i < items.length; i += batch) {
			console.log('call', i, 'of', items.length);

			const calls = [];

			for (let j = i; j < Math.min(i + batch, items.length); j++) {
				const populatedCall = await call(items[j]);
				calls.push({
					target: populatedCall.to,
					callData: populatedCall.data,
					allowFailure: false,
				});
			}

			const values = await MultiCall.callStatic.aggregate3(calls);

			let succeeded = 0;

			for (let j = i; j < Math.min(i + batch, items.length); j++) {
				await onResult(items[j], values[j - i]);

				if (values[j - i].success) succeeded++;
			}

			if (write && succeeded / values.length >= write) {
				const gasUsage = await MultiCall.estimateGas.aggregate3(calls);
				const tx = await MultiCall.aggregate3(calls, {
					gasLimit: gasUsage.add(gasUsage.div(10)),
				});
				console.log('submitted tx:', tx.hash);
				await tx.wait();
			}
		}

		return results;
	}

	async function csvToJSON(csv) {
		var lines = csv.split('\n');
		var result = [];

		// NOTE: If your columns contain commas in their values, you'll need
		// to deal with those before doing the next step
		var headers = lines[0].split(',');

		for (var i = 1; i < lines.length; i++) {
			var obj = {};
			var currentline = lines[i].split(',');

			for (var j = 0; j < headers.length; j++) {
				obj[headers[j]] = currentline[j];
			}
			result.push(obj);
		}
		return result;
	}
};

module.exports = {
	liquidatorRewardsRestitution,
	cmd: program =>
		program
			.command('liquidator-rewards-restitution')
			.description('Restore liquidator rewards')
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '2')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'goerli')
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option(
				'--threshold <amount>',
				'Filter out small amounts that are not worth the gas cost',
				'50'
			)
			.option('--csv <file>', 'CSV of all addresses to scan', 'snx.csv')
			.action(liquidatorRewardsRestitution),
};
