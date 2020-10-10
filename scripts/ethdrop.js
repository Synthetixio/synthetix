require('dotenv').config();

const fs = require('fs');
const program = require('commander');
const inquirer = require('inquirer');
const ethers = require('ethers');
const { gray, cyan, yellow, green, red } = require('chalk');

async function ethdrop({
	network,
	mnemonic,
	numWallets,
	collect,
	providerUrl,
	gasPrice,
	gasLimit,
	dataFile,
}) {
	console.clear();

	// ----------------------------------
	// Utils
	// ----------------------------------

	function exitWithError(msg) {
		console.log(red(msg));
		process.exit(1);
	}

	function exitNormally() {
		console.log(green('Done!'));
		process.exit(0);
	}

	// ----------------------------------
	// Validate
	// ----------------------------------

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
	if (!providerUrl) exitWithError('Cannot setup provider');

	if (!dataFile) throw new Error('Please specify a path to an input JSON file.');
	if (!fs.existsSync(dataFile)) throw new Error(`No file at ${dataFile}.`);

	// ----------------------------------
	// Build wallets
	// ----------------------------------

	console.log(yellow('Setting up wallets...'));

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const wallets = [];

	const master = new ethers.utils.HDNode.fromMnemonic(mnemonic);
	for (let i = 0; i < numWallets; i++) {
		const node = master.derivePath(`m/44'/60'/0'/0/${i}`);
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

	// ----------------------------------
	// Get target addresses
	// ----------------------------------

	const data = JSON.parse(fs.readFileSync(dataFile));

	// ----------------------------------
	// Review and confirm
	// ----------------------------------

	console.log(cyan('Please review this information before continuing:'));
	console.log(
		gray('================================================================================')
	);
	console.log(yellow('* network', network));
	if (collect) console.log(yellow('* collect = true'));
	console.log(gray('* gasPrice', gasPrice));
	console.log(gray('* numWallets', numWallets));
	console.log(gray('* target addresses', data.length));
	console.log(
		gray('================================================================================')
	);

	const { confirmation } = await inquirer.prompt([
		{
			type: 'confirm',
			name: 'confirmation',
			message: 'Continue?',
		},
	]);

	if (!confirmation) {
		exitWithError('User cancelled');
	}

	// ----------------------------------
	// Prepare
	// ----------------------------------

	gasPrice = ethers.utils.parseUnits(gasPrice, 'gwei');

	const overrides = {
		gasPrice,
		gasLimit,
	};

	await showBalances();

	// ----------------------------------
	// Collect Ether
	// ----------------------------------

	async function collectEther() {
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
				...overrides,
				gasLimit: 21000,
				to: firstWalletAddress,
				value: 42,
			};

			const cost = ethers.BigNumber.from(tx.gasLimit).mul(gasPrice);
			console.log(gray(`    Tx cost: ${ethers.utils.formatEther(cost)}`));
			const value = balance.sub(cost);
			console.log(gray(`    Value to send: ${ethers.utils.formatEther(value)}`));

			if (value.isZero() || value.isNegative()) {
				console.log(gray(`    No value to send`));
				continue;
			}

			tx.value = value;

			console.log(
				gray(
					`    Sending ${ethers.utils.formatEther(
						value
					)} Ether from ${fromAddress} to ${firstWalletAddress}`
				)
			);

			try {
				const response = await wallet.sendTransaction(tx);
				txs.push(response);
			} catch (error) {
				console.log(red(error));
			}
		}

		console.log(cyan(`Transactions sent, waiting for completion...`));

		const receipts = txs.map(async tx => await tx.wait());
		await Promise.all(receipts);

		console.log(cyan(`Collected Ether from ${wallets.length} addresses.`));
	}

	if (collect) {
		await collectEther();
		await showBalances();
		exitNormally();
	}
}

program
	.description('Transfer Ether to a lot of accounts')
	.option('-c, --collect', 'Collects Ether from all wallets into the first', false)
	.option(
		'-d, --data-file <value>',
		'The path to the JSON file containing the target addresses'
	)
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option(
		'-m, --mnemonic <value>',
		'Mnemonic used to derive wallet addresses that will be used to send out Ether'
	)
	.option('-n, --network <value>', 'Network to use', 'goerli')
	.option('-t, --target-balance <value>', 'Balance for target addresses', 0.01)
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
