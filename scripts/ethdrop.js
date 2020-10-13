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
	collectOnly,
	providerUrl,
	gasPrice,
	gasLimit,
	dataFile,
	targetBalance,
	skipDistribution,
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
	gasPrice = `${gasPrice}`;

	if (isNaN(gasLimit) || gasLimit < 0) {
		exitWithError('Invalid gasLimit');
	}
	gasLimit = `${gasLimit}`;

	if (isNaN(targetBalance) || targetBalance < 0) {
		exitWithError('Invalid targetBalance');
	}
	targetBalance = `${targetBalance}`;

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

	const master = ethers.utils.HDNode.fromMnemonic(mnemonic);
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

	await showBalances();

	console.log(cyan('Please review this information before continuing:'));
	console.log(
		gray('================================================================================')
	);
	console.log(yellow('* network', network));
	if (collectOnly) console.log(yellow('* collectOnly: true'));
	if (skipDistribution) console.log(yellow('* skipDistribution: true'));
	console.log(gray('* gasPrice:', gasPrice));
	console.log(gray('* numWallets:', numWallets));
	console.log(gray('* target addresses:', data.length));
	console.log(gray('* target balance:', targetBalance));
	console.log(gray('* total eth to send:', targetBalance * data.length));
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

	// ----------------------------------
	// Collect Ether
	// ----------------------------------

	const sendGasLimit = 21000;
	const cost = ethers.BigNumber.from(sendGasLimit).mul(gasPrice);

	const firstWallet = wallets[0];
	const firstWalletAddress = await firstWallet.getAddress();

	async function collectEther() {
		console.log(yellow('Collecting Ether...'));

		const txs = [];
		for (let i = 1; i < wallets.length; i++) {
			const wallet = wallets[i];
			const fromAddress = await wallet.getAddress();
			const balance = await wallet.getBalance();
			console.log(gray(`  > Draining wallet ${fromAddress}:`));
			console.log(gray(`    Balance: ${ethers.utils.formatEther(balance)}`));

			const tx = {
				...overrides,
				gasLimit: sendGasLimit,
				to: firstWalletAddress,
			};

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

		const receipts = txs.map(async tx => tx.wait());
		await Promise.all(receipts);

		console.log(cyan(`Collected Ether from ${wallets.length} addresses.`));
	}

	if (!skipDistribution) {
		await collectEther();
	}

	if (collectOnly) {
		exitNormally();
	}

	// ----------------------------------
	// Distribute Ether
	// ----------------------------------

	async function distributeEther() {
		console.log(yellow(`Distributing Ether between sender wallets...`));

		// Calculate target balance.
		const numWalletsBN = ethers.BigNumber.from(numWallets);
		const totalBalance = await firstWallet.getBalance();
		const totalCost = cost.mul(numWalletsBN);
		const total = totalBalance.sub(totalCost);
		const target = total.div(numWalletsBN);
		console.log(gray(`  > total balance: ${ethers.utils.formatEther(total)}`));
		console.log(gray(`  > target sender balance: ${ethers.utils.formatEther(target)}`));

		if (target.isZero()) {
			exitWithError(`Invalid target value: ${target}`);
		}

		// Send target balance.
		const txs = [];
		for (let i = 1; i < wallets.length; i++) {
			const wallet = wallets[i];
			const walletAddress = await wallet.getAddress();

			const tx = {
				...overrides,
				gasLimit: sendGasLimit,
				to: walletAddress,
				value: target,
			};

			console.log(
				gray(
					`    Sending ${ethers.utils.formatEther(
						target
					)} Ether from ${firstWalletAddress} to ${walletAddress}`
				)
			);

			try {
				const response = await firstWallet.sendTransaction(tx);
				txs.push(response);
			} catch (error) {
				console.log(red(error));
			}
		}

		console.log(cyan(`Transactions sent, waiting for completion...`));

		const receipts = txs.map(async tx => tx.wait());
		await Promise.all(receipts);

		console.log(cyan(`Distributed Ether in ${wallets.length} addresses.`));
	}

	if (!skipDistribution) {
		await distributeEther();
	}

	// ----------------------------------
	// Send to target addresses
	// ----------------------------------

	async function sendToAllTargets() {
		console.log(yellow('Sending to all targets...'));

		let completedTargets = 0;
		let successTargets = 0;
		let missedTargets = 0;
		let sentTargets = 0;

		const allTargets = data.map(item => item.address);

		// Split array of target addresses, 1 for each sender wallet.
		const splitTargets = [];
		const targetsPerWallet = Math.ceil(allTargets.length / numWallets);
		for (let i = 0; i < allTargets.length; i += targetsPerWallet) {
			const section = allTargets.slice(i, i + targetsPerWallet);
			splitTargets.push(section);
		}

		async function sendToTargets({ wallet, targets }) {
			console.log(yellow(`[Started thread to send to ${targets.length} addresses]`));

			const walletAddress = await wallet.getAddress();

			const targetBalanceBN = ethers.utils.parseEther(targetBalance);

			for (let i = 0; i < targets.length; i++) {
				const target = targets[i];
				const balance = await provider.getBalance(target);
				console.log(gray(`  > Address ${target}: ${ethers.utils.formatEther(balance)} ETH`));

				if (balance.lt(targetBalanceBN)) {
					const delta = targetBalanceBN.sub(balance);

					const tx = {
						...overrides,
						gasLimit: sendGasLimit,
						to: target,
						value: delta,
					};

					console.log(
						gray(
							`      Sending ${ethers.utils.formatEther(
								delta
							)} Ether from ${walletAddress} to ${target}`
						)
					);

					try {
						sentTargets++;

						const transaction = await wallet.sendTransaction(tx);
						await transaction.wait();

						console.log(green(`      Send successful ${JSON.stringify(transaction, null, 2)}`));
						successTargets++;
					} catch (error) {
						console.log(red(error));
						missedTargets++;
					}
				} else {
					console.log(gray(`      Address already has target balance`));
					successTargets++;
				}

				completedTargets++;
				console.log(
					cyan(
						`Completed ${completedTargets}, successful: ${successTargets}, missed: ${missedTargets}, sent: ${sentTargets}`
					)
				);
			}
		}

		let idx = 0;
		const promises = wallets.map(wallet => {
			const promise = sendToTargets({ wallet, targets: splitTargets[idx] });
			idx++;

			return promise;
		});

		await Promise.all(promises);
	}

	await sendToAllTargets();

	await collectEther();

	await showBalances();

	exitNormally();
}

program
	.description('Transfer Ether to a lot of accounts')
	.option(
		'-c, --collect-only',
		'Collects Ether from all wallets into the first and does not resume with the airdrop',
		false
	)
	.option('-d, --data-file <value>', 'The path to the JSON file containing the target addresses')
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option(
		'-m, --mnemonic <value>',
		'Mnemonic used to derive wallet addresses that will be used to send out Ether'
	)
	.option('-n, --network <value>', 'Network to use', 'goerli')
	.option('-s, --skip-distribution', 'Skip distributing Ether between sender wallets', false)
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
