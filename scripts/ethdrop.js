require('dotenv').config();

const program = require('commander');
const ethers = require('ethers');
const { gray, cyan, yellow, red } = require('chalk');

async function ethdrop({ network, mnemonic, numWallets, collect, providerUrl, gasPrice, gasLimit }) {
	console.clear();

	// ----------------------------------
	// Validate
	// ----------------------------------

	function exitWithError(msg) {
		console.log(red(msg));
		process.exit(1);
	}

	if (isNaN(numWallets) || numWallets < 1) {
		exitWithError('Invalid numWallets');
	}

	if (isNaN(gasPrice) || gasPrice < 0) {
		exitWithError('Invalid gasPrice');
	}

	if (isNaN(gasLimit) || gasLimit < 0) {
		exitWithError('Invalid gasLimit');
	}

	if (!ethers.utils.isValidMnemonic(mnemonic)) {
		exitWithError('Invalid mnemonic');
	}

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) exitWithError('Cannot setup provider')

	// ----------------------------------
	// Build wallets
	// ----------------------------------

	console.log(yellow('Setting up wallets...'));

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const wallets = [];

	const master = new ethers.utils.HDNode.fromMnemonic(mnemonic);
	for (let i = 0; i < numWallets; i++) {
		const node = master.derivePath(`m/44'/60'/0'/0/${i}`)
		console.log(gray(`  > Wallet ${i}: ${node.address}`));

		const wallet = new ethers.Wallet(node.privateKey, provider);
		wallets.push(wallet);
	}

	async function showBalances() {
		console.log(yellow(`Wallet balances:`));
		for (let i = 0; i < numWallets; i++) {
			const wallet = wallets[i];
			const balance = ethers.utils.formatEther(await wallet.getBalance());
			console.log(gray(`  > Wallet ${i} - ${await wallet.getAddress()}: ${balance}`));
		}
	}

	// await showBalances();

	// ----------------------------------
	// Prepare for txs
	// ----------------------------------

	console.log(yellow(`Transaction parameters:`));

	gasPrice = ethers.utils.parseUnits(gasPrice, 'gwei');

	const overrides = {
		gasPrice,
		gasLimit
	};

	console.log(gray('  > gasPrice', gasPrice.toString()));

	// ----------------------------------
	// Collect Ether
	// ----------------------------------

	if (collect) {
		console.log(yellow('Collecting Ether...'));

		const txs = [];
		const firstWalletAddress = await wallets[0].getAddress();
		for (let i = 1; i < wallets.length; i++) {
			const wallet = wallets[i];
			const fromAddress = await wallet.getAddress();
			const balance = await wallet.getBalance();
			console.log(gray(`  > Draining wallet ${fromAddress}:`));
			console.log(gray(`    Balance: ${ethers.utils.formatEther(balance)}`));

			const tx = {
				to: firstWalletAddress,
				value: 42,
				...overrides,
			};

			const gas = await wallet.estimateGas(tx);
			console.log(gray(`    Tx gas: ${gas.toString()}`));
			const cost = gas.mul(gasPrice).add(ethers.BigNumber.from('10'));
			console.log(gray(`    Tx cost: ${ethers.utils.formatEther(cost)}`));
			const value = balance.sub(cost);
			console.log(gray(`    Value to send: ${ethers.utils.formatEther(value)}`));

			if (value.isZero() || value.isNegative()) {
				console.log(gray(`    No value to send`));
				continue;
			}

			tx.value = value;
			console.log(tx.value.toString());
			continue;

			console.log(gray(`    Sending ${
				ethers.utils.formatEther(value)
			} Ether from ${fromAddress} to ${firstWalletAddress}`));

			try {
				const response = await wallet.sendTransaction(tx);
				txs.push(response);

				console.log(receipt);
			} catch(error) {
				console.log(red(error));
			}
		}

		console.log(cyan(`Transactions sent, waiting for completion...`));

		const receipts = txs.map(async tx => await tx.wait());
		await Promise.all(receipts);

		console.log(cyan(`Collected Ether from ${wallets.length} addresses.`));

		await showBalances();

		console.log(yellow('Exiting...'));
		process.exit(0);
	}
}

program
	.description('Transfer Ether to a lot of accounts')
	.option('-c, --collect', 'Collects Ether from all wallets into the first', false)
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option('-m, --mnemonic <value>', 'Mnemonic used to derive wallet addresses that will be used to send out Ether')
	.option('-n, --network <value>', 'Network to use', 'mainnet')
	.option('-w, --num-wallets <value>', 'Number of simultaneous wallets to use to send Ether', 8)
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.action(async (...args) => {
		try {
			await ethdrop(...args);
		} catch (err) {
			console.error(red(err));
			console.log(err.stack);

			process.exitCode = 1;
		}
	});

if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}

