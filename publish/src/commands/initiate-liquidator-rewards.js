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

const initiateLiquidatorRewards = async ({
	network,
	deploymentPath,
	privateKey,
	useOvm,
	useFork,
	providerUrl,
	etherscanAddressCsv,
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

	// Instantiate Debt Share contract
	const { address: debtSharesAddress } = deployment.targets['SynthetixDebtShare'];
	const { abi: debtSharesABI } = deployment.sources[
		deployment.targets['SynthetixDebtShare'].source
	];
	const SynthetixDebtShare = new ethers.Contract(debtSharesAddress, debtSharesABI, signer);

	// Instantiate Liquidator Rewards contract
	const { address: liquidatorRewardsAddress } = deployment.targets['LiquidatorRewards'];
	const { abi: liquidatorRewardsABI } = deployment.sources[
		deployment.targets['LiquidatorRewards'].source
	];
	const LiquidatorRewards = new ethers.Contract(
		liquidatorRewardsAddress,
		liquidatorRewardsABI,
		signer
	);

	// Instantiate MultiCall contract
	const multiCallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11'; // L1 + L2 address
	const multiCallABI = [
		{
			inputs: [
				{
					components: [
						{ internalType: 'address', name: 'target', type: 'address' },
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Call[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'aggregate',
			outputs: [
				{ internalType: 'uint256', name: 'blockNumber', type: 'uint256' },
				{ internalType: 'bytes[]', name: 'returnData', type: 'bytes[]' },
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
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Call3[]',
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
					internalType: 'struct Multicall3.Result[]',
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
					internalType: 'struct Multicall3.Call3Value[]',
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
					internalType: 'struct Multicall3.Result[]',
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
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Call[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'blockAndAggregate',
			outputs: [
				{ internalType: 'uint256', name: 'blockNumber', type: 'uint256' },
				{ internalType: 'bytes32', name: 'blockHash', type: 'bytes32' },
				{
					components: [
						{ internalType: 'bool', name: 'success', type: 'bool' },
						{ internalType: 'bytes', name: 'returnData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Result[]',
					name: 'returnData',
					type: 'tuple[]',
				},
			],
			stateMutability: 'payable',
			type: 'function',
		},
		{
			inputs: [],
			name: 'getBasefee',
			outputs: [{ internalType: 'uint256', name: 'basefee', type: 'uint256' }],
			stateMutability: 'view',
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
			inputs: [
				{ internalType: 'bool', name: 'requireSuccess', type: 'bool' },
				{
					components: [
						{ internalType: 'address', name: 'target', type: 'address' },
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Call[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'tryAggregate',
			outputs: [
				{
					components: [
						{ internalType: 'bool', name: 'success', type: 'bool' },
						{ internalType: 'bytes', name: 'returnData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Result[]',
					name: 'returnData',
					type: 'tuple[]',
				},
			],
			stateMutability: 'payable',
			type: 'function',
		},
		{
			inputs: [
				{ internalType: 'bool', name: 'requireSuccess', type: 'bool' },
				{
					components: [
						{ internalType: 'address', name: 'target', type: 'address' },
						{ internalType: 'bytes', name: 'callData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Call[]',
					name: 'calls',
					type: 'tuple[]',
				},
			],
			name: 'tryBlockAndAggregate',
			outputs: [
				{ internalType: 'uint256', name: 'blockNumber', type: 'uint256' },
				{ internalType: 'bytes32', name: 'blockHash', type: 'bytes32' },
				{
					components: [
						{ internalType: 'bool', name: 'success', type: 'bool' },
						{ internalType: 'bytes', name: 'returnData', type: 'bytes' },
					],
					internalType: 'struct Multicall3.Result[]',
					name: 'returnData',
					type: 'tuple[]',
				},
			],
			stateMutability: 'payable',
			type: 'function',
		},
	];
	const MultiCall = new ethers.Contract(multiCallAddress, multiCallABI, signer);

	// Get a list of addresses from the csv file
	const addrs = fs.readFileSync(etherscanAddressCsv).toString('utf8');
	const lines = addrs.split('\n');

	const filteredAddresses = [];

	// Filter out unwanted text
	const unFilteredAddresses = lines
		.slice(1)
		.filter(l => l)
		.map(l => JSON.parse(l.split(',')[0]));

	// Check for accounts with debt shares and add them to the `filteredAddresses` list.
	await readMulticall(
		unFilteredAddresses,
		a => SynthetixDebtShare.populateTransaction.balanceOf(a),
		(a, r) => {
			const output = ethers.utils.defaultAbiCoder.decode(['uint256'], r.returnData);
			if (output[0].gt(0)) {
				filteredAddresses.push(a);
			}
		},
		0,
		2000
	);

	console.log('updating entries for ', filteredAddresses.length, 'addresses');

	// Update liquidator rewards entries for all stakers.
	await readMulticall(
		filteredAddresses,
		a => LiquidatorRewards.populateTransaction.updateEntry(a),
		(a, r) => {},
		0, // 0 = READ; 1 = WRITE;
		150 // L1 max size = ~200; L2 max size = ~150;
	);

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
					gasLimit: gasUsage,
				});
				console.log('submitted tx:', tx.hash);
				await tx.wait();
			}
		}

		return results;
	}

	console.log(green('Completed successfully'));
};

module.exports = {
	initiateLiquidatorRewards,
	cmd: program =>
		program
			.command('initiate-liquidator-rewards')
			.description('Initialize entries for liquidator rewards')
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
			.option('--etherscan-address-csv <file>', 'CSV of all addresses to scan', 'snx-addrs.csv')
			.action(initiateLiquidatorRewards),
};
