'use strict';

const path = require('path');
const fs = require('fs');
const { gray, green, yellow, cyan } = require('chalk');
const { table } = require('table');
const w3utils = require('web3-utils');
const Deployer = require('../Deployer');

const {
	BUILD_FOLDER,
	COMPILED_FOLDER,
	CONFIG_FILENAME,
	SYNTHS_FILENAME,
	DEPLOYMENT_FILENAME,
	ZERO_ADDRESS,
} = require('../constants');

const {
	toBytes4,
	ensureNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	appendOwnerActionGenerator,
	stringify,
} = require('../util');

module.exports = program =>
	program
		.command('deploy')
		.description('Deploy compiled solidity files')
		.option(
			'-a, --add-new-synths',
			`Whether or not any new synths in the ${SYNTHS_FILENAME} file should be deployed if there is no entry in the config file`,
			false
		)
		.option(
			'-b, --build-path [value]',
			'Path to a folder hosting compiled files from the "build" step in this script',
			path.join(__dirname, '..', '..', '..', BUILD_FOLDER)
		)
		.option(
			'-c, --contract-deployment-gas-limit <value>',
			'Contract deployment gas limit',
			parseInt,
			7e6
		)
		.option(
			'-d, --deployment-path <value>',
			`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
		)
		.option(
			'-o, --oracle <value>',
			'The address of the oracle for this network',
			'0xac1e8b385230970319906c03a1d8567e3996d1d5' // the oracle for testnets
		)
		.option(
			'-f, --fee-auth <value>',
			'The address of the fee authority for this network',
			'0xfee056f4d9d63a63d6cf16707d49ffae7ff3ff01' // the fee authority for testnets
		)
		.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
		.option('-m, --method-call-gas-limit <value>', 'Method call gas limit', parseInt, 15e4)
		.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
		.action(
			async ({
				addNewSynths,
				gasPrice,
				methodCallGasLimit,
				contractDeploymentGasLimit,
				network,
				buildPath,
				deploymentPath,
				oracle,
				feeAuth,
			}) => {
				ensureNetwork(network);
				ensureDeploymentPath(deploymentPath);

				const {
					config,
					configFile,
					synths,
					deployment,
					deploymentFile,
					ownerActions,
					ownerActionsFile,
				} = loadAndCheckRequiredSources({
					deploymentPath,
					network,
				});

				console.log(
					gray(
						'Checking all contracts not flagged for deployment have addresses in this network...'
					)
				);
				const missingDeployments = Object.keys(config).filter(name => {
					return (
						!config[name].deploy && (!deployment.targets[name] || !deployment.targets[name].address)
					);
				});

				if (missingDeployments.length) {
					throw Error(
						`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:\n` +
							missingDeployments.join('\n') +
							'\n' +
							gray(`Used: ${deploymentFile} as source`)
					);
				}

				console.log(gray('Loading the compiled contracts locally...'));
				const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

				let firstTimestamp = Infinity;

				const compiled = fs
					.readdirSync(compiledSourcePath)
					.filter(name => /^.+\.json$/.test(name))
					.reduce((memo, contractFilename) => {
						const contract = contractFilename.replace(/\.json$/, '');
						const sourceFile = path.join(compiledSourcePath, contractFilename);
						firstTimestamp = Math.min(firstTimestamp, fs.statSync(sourceFile).mtimeMs);
						if (!fs.existsSync(sourceFile)) {
							throw Error(
								`Cannot find compiled contract code for: ${contract}. Did you run the "build" step first?`
							);
						}
						memo[contract] = JSON.parse(fs.readFileSync(sourceFile));
						return memo;
					}, {});

				// JJM: We could easily add an error here if the earlist build is before the latest SOL contract modification
				console.log(
					yellow(
						`Note: using build files of which, the earlist was modified on ${new Date(
							firstTimestamp
						)}. This is roughly ${((new Date().getTime() - firstTimestamp) / 60000).toFixed(
							2
						)} mins ago.`
					)
				);

				// now clone these so we can update and write them after each deployment but keep the original
				// flags available
				const updatedConfig = JSON.parse(JSON.stringify(config));

				const { providerUrl, privateKey, etherscanLinkPrefix } = loadConnections({ network });

				const deployer = new Deployer({
					compiled,
					config,
					gasPrice,
					methodCallGasLimit,
					contractDeploymentGasLimit,
					deployment,
					privateKey,
					providerUrl,
				});

				const { account } = deployer;
				console.log(gray(`Using account with public key ${account}`));

				try {
					await confirmAction(
						cyan(
							`${yellow(
								'WARNING'
							)}: This action will deploy the following contracts to ${network}:\n- ${Object.entries(
								config
							)
								.filter(([, { deploy }]) => deploy)
								.map(([contract]) => contract)
								.join('\n- ')}`
						) +
							'\nIt will also set proxy targets and add synths to Synthetix.\n Do you want to continue? (y/n) '
					);
				} catch (err) {
					console.log(gray('Operation cancelled'));
					process.exit();
				}

				console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));
				// force flag indicates to deploy even when no config for the entry (useful for new synths)
				const deployContract = async ({ name, source = name, args, deps, force = false }) => {
					const deployedContract = await deployer.deploy({ name, source, args, deps, force });
					if (!deployedContract) {
						return;
					}
					const { address } = deployedContract.options;

					let timestamp = new Date();
					let txn = '';
					if (config[name] && !config[name].deploy) {
						// deploy is false, so we reused a deployment, thus lets grab the details that already exist
						timestamp = deployment.targets[name].timestamp;
						txn = deployment.targets[name].txn;
					}
					// now update the deployed contract information
					deployment.targets[name] = {
						name,
						address,
						source,
						link: `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io/address/${
							deployer.deployedContracts[name].options.address
						}`,
						timestamp,
						txn,
						network,
					};
					deployment.sources[source] = {
						bytecode: compiled[source].evm.bytecode.object,
						abi: compiled[source].abi,
					};
					fs.writeFileSync(deploymentFile, stringify(deployment));

					// now update the flags to indicate it no longer needs deployment
					updatedConfig[name] = { deploy: false };

					fs.writeFileSync(configFile, stringify(updatedConfig));
					return deployedContract;
				};

				// track an action we cannot perform because we aren't an OWNER (so we can iterate later in the owner step)
				const appendOwnerAction = appendOwnerActionGenerator({
					ownerActions,
					ownerActionsFile,
					etherscanLinkPrefix,
				});

				await deployContract({
					name: 'SafeDecimalMath',
				});

				const exchangeRates = await deployContract({
					name: 'ExchangeRates',
					args: [account, oracle, [toBytes4('SNX')], [w3utils.toWei('0.2')]],
				});
				const exchangeRatesAddress = exchangeRates ? exchangeRates.options.address : '';

				const rewardEscrow = await deployContract({
					name: 'RewardEscrow',
					args: [account, ZERO_ADDRESS, ZERO_ADDRESS],
				});

				const synthetixEscrow = await deployContract({
					name: 'SynthetixEscrow',
					args: [account, ZERO_ADDRESS],
				});

				const synthetixState = await deployContract({
					name: 'SynthetixState',
					args: [account, account],
				});

				const proxyFeePool = await deployContract({
					name: 'ProxyFeePool',
					source: 'Proxy',
					args: [account],
				});

				const feePoolDelegateApprovals = await deployContract({
					name: 'DelegateApprovals',
					args: [account, ZERO_ADDRESS],
				});

				const feePoolEternalStorage = await deployContract({
					name: 'FeePoolEternalStorage',
					args: [account, ZERO_ADDRESS],
				});

				const feePool = await deployContract({
					name: 'FeePool',
					deps: ['ProxyFeePool'],
					args: [
						proxyFeePool ? proxyFeePool.options.address : '',
						account,
						ZERO_ADDRESS, // Synthetix
						ZERO_ADDRESS, // FeePoolState
						feePoolEternalStorage ? feePoolEternalStorage.options.address : '',
						synthetixState ? synthetixState.options.address : '',
						rewardEscrow ? rewardEscrow.options.address : '',
						feeAuth,
						w3utils.toWei('0'), // transfer fee
						w3utils.toWei('0.003'), // exchange fee
					],
				});

				const feePoolAddress = feePool ? feePool.options.address : '';
				const feePoolOwner = feePool ? await feePool.methods.owner().call() : '';

				if (proxyFeePool && feePool) {
					const target = await proxyFeePool.methods.target().call();

					if (target !== feePool.options.address) {
						const proxyFeePoolOwner = await proxyFeePool.methods.owner().call();

						if (proxyFeePoolOwner === account) {
							console.log(yellow('Invoking ProxyFeePool.setTarget(FeePool)...'));

							await proxyFeePool.methods
								.setTarget(feePool.options.address)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `ProxyFeePool.setTarget(FeePool)`,
								target: proxyFeePool.options.address,
								action: `setTarget(${feePool.options.address})`,
							});
						}
					}
				}

				if (feePoolEternalStorage && feePool) {
					const associatedFPContract = await feePoolEternalStorage.methods
						.associatedContract()
						.call();

					if (associatedFPContract !== feePoolAddress) {
						const feePoolEternalStorageOwner = await feePoolEternalStorage.methods.owner().call();

						if (feePoolEternalStorageOwner === account) {
							console.log(
								yellow('Invoking feePoolEternalStorage.setAssociatedContract(FeePool)...')
							);

							await feePoolEternalStorage.methods
								.setAssociatedContract(feePoolAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `FeePoolEternalStorage.setAssociatedContract(FeePool)`,
								target: feePoolEternalStorage.options.address,
								action: `setAssociatedContract(${feePoolAddress})`,
							});
						}
					}
				}

				if (feePoolDelegateApprovals && feePool) {
					const delegateApprovalsAddress = feePoolDelegateApprovals.options.address;
					const feePoolOwner = await feePool.methods.owner().call();

					const associatedContract = await feePoolDelegateApprovals.methods
						.associatedContract()
						.call();

					if (feePoolOwner === account) {
						console.log(yellow('Invoking feePool.setDelegateApprovals(DelegateApproval)...'));
						await feePool.methods
							.setDelegateApprovals(delegateApprovalsAddress)
							.send(deployer.sendParameters());
					} else {
						appendOwnerAction({
							key: `FeePool.setDelegateApprovals(DelegateApprovals)`,
							target: feePool.options.address,
							action: `setDelegateApprovals(${delegateApprovalsAddress})`,
						});
					}

					if (associatedContract !== feePoolAddress) {
						const feePoolDelegateApprovalsOwner = await feePoolDelegateApprovals.methods
							.owner()
							.call();

						if (feePoolDelegateApprovalsOwner === account) {
							console.log(
								yellow('Invoking feePoolDelegateApprovals.setAssociatedContract(FeePool)...')
							);

							await feePoolDelegateApprovals.methods
								.setAssociatedContract(feePoolAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `DelegateApprovals.setAssociatedContract(FeePool)`,
								target: feePoolDelegateApprovals.options.address,
								action: `setAssociatedContract(${feePoolAddress})`,
							});
						}
					}
				}

				const feePoolState = await deployContract({
					name: 'FeePoolState',
					deps: ['FeePool'],
					args: [account, feePoolAddress],
				});

				if (feePool && feePoolState) {
					const deployedFeePoolState = await feePool.methods.feePoolState().call();
					const feePoolStateAddress = feePoolState.options.address;

					if (deployedFeePoolState !== feePoolStateAddress) {
						if (feePoolOwner === account) {
							console.log(yellow('Invoking FeePool.setFeePoolState(FeePoolState)...'));

							await feePool.methods
								.setFeePoolState(feePoolStateAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: 'FeePool.setFeePoolState(FeePoolState)',
								target: feePoolStateAddress,
								action: `setFeePoolState(${feePoolStateAddress})`,
							});
						}
					}
					// Rewire feePoolState if there is a feePool upgrade
					const configuredFeePoolAddress = await feePoolState.methods.feePool().call();
					if (configuredFeePoolAddress !== feePool.options.address) {
						const feePoolStateOwner = await feePoolState.methods.owner().call();
						if (feePoolStateOwner === account) {
							console.log(yellow('Invoking FeePoolState.setFeePool(FeePool)...'));

							await feePoolState.methods
								.setFeePool(feePool.options.address)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: 'FeePoolState.setFeePool(FeePool)',
								target: feePool.options.address,
								action: `setFeePool(${feePool.options.address})`,
							});
						}
					}
				}

				const supplySchedule = await deployContract({
					name: 'SupplySchedule',
					args: [account],
				});

				const proxySynthetix = await deployContract({
					name: 'ProxySynthetix',
					source: 'Proxy',
					args: [account],
				});
				const tokenStateSynthetix = await deployContract({
					name: 'TokenStateSynthetix',
					source: 'TokenState',
					args: [account, account],
				});
				const synthetix = await deployContract({
					name: 'Synthetix',
					deps: [
						'ProxySynthetix',
						'TokenStateSynthetix',
						'SynthetixState',
						'ExchangeRates',
						'FeePool',
						'SupplySchedule',
						'RewardEscrow',
						'SynthetixEscrow',
					],
					args: [
						proxySynthetix ? proxySynthetix.options.address : '',
						tokenStateSynthetix ? tokenStateSynthetix.options.address : '',
						synthetixState ? synthetixState.options.address : '',
						account,
						exchangeRates ? exchangeRates.options.address : '',
						feePool ? feePool.options.address : '',
						supplySchedule ? supplySchedule.options.address : '',
						rewardEscrow ? rewardEscrow.options.address : '',
						synthetixEscrow ? synthetixEscrow.options.address : '',
					],
				});

				const synthetixAddress = synthetix ? synthetix.options.address : '';
				// get the owner (might not be us if we didn't just do a deploy)
				const synthetixOwner = await synthetix.methods.owner().call();

				if (proxySynthetix && synthetix) {
					const target = await proxySynthetix.methods.target().call();
					if (target !== synthetixAddress) {
						const proxyOwner = await proxySynthetix.methods.owner().call();

						if (proxyOwner === account) {
							console.log(yellow('Invoking ProxySynthetix.setTarget(Synthetix)...'));
							await proxySynthetix.methods
								.setTarget(synthetixAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `ProxySynthetix.setTarget(Synthetix)`,
								target: proxySynthetix.options.address,
								action: `setTarget(${synthetixAddress})`,
							});
						}
					}
				}

				// only reset token state if redeploying
				if (tokenStateSynthetix && config['TokenStateSynthetix'].deploy) {
					const balance = await tokenStateSynthetix.methods.balanceOf(account).call();

					const initialIssuance = w3utils.toWei('100000000');
					if (balance !== initialIssuance) {
						console.log(yellow('Invoking TokenStateSynthetix.setBalanceOf(100M)...'));
						await tokenStateSynthetix.methods
							.setBalanceOf(account, initialIssuance)
							.send(deployer.sendParameters());
					}
				}

				if (tokenStateSynthetix && synthetix) {
					const associatedTSContract = await tokenStateSynthetix.methods
						.associatedContract()
						.call();
					if (associatedTSContract !== synthetixAddress) {
						const tokenStateSynthetixOwner = await tokenStateSynthetix.methods.owner().call();

						if (tokenStateSynthetixOwner === account) {
							console.log(
								yellow('Invoking TokenStateSynthetix.setAssociatedContract(Synthetix)...')
							);
							await tokenStateSynthetix.methods
								.setAssociatedContract(synthetixAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `TokenStateSynthetix.setAssociatedContract(Synthetix)`,
								target: tokenStateSynthetix.options.address,
								action: `setAssociatedContract(${synthetixAddress})`,
							});
						}
					}
					const associatedSSContract = await synthetixState.methods.associatedContract().call();
					if (associatedSSContract !== synthetixAddress) {
						const synthetixStateOwner = await synthetixState.methods.owner().call();

						if (synthetixStateOwner === account) {
							console.log(yellow('Invoking SynthetixState.setAssociatedContract(Synthetix)...'));
							await synthetixState.methods
								.setAssociatedContract(synthetixAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `SynthetixState.setAssociatedContract(Synthetix)`,
								target: synthetixState.options.address,
								action: `setAssociatedContract(${synthetixAddress})`,
							});
						}
					}
				}

				if (synthetixEscrow) {
					await deployContract({
						name: 'EscrowChecker',
						deps: ['SynthetixEscrow'],
						args: [synthetixEscrow.options.address],
					});
				}

				if (rewardEscrow && synthetix) {
					// only the owner can do this
					const rewardEscrowOwner = await rewardEscrow.methods.owner().call();

					if (rewardEscrowOwner === account) {
						console.log(yellow('Invoking RewardEscrow.setSynthetix()...'));
						await rewardEscrow.methods
							.setSynthetix(synthetixAddress)
							.send(deployer.sendParameters());
					} else {
						console.log(cyan('Cannot call RewardEscrow.setSynthetix() as not owner.'));
					}
				}

				if (rewardEscrow && feePool) {
					// only the owner can do this
					const rewardEscrowOwner = await rewardEscrow.methods.owner().call();

					if (rewardEscrowOwner === account) {
						console.log(yellow('Invoking RewardEscrow.setFeePool()...'));
						await rewardEscrow.methods.setFeePool(feePoolAddress).send(deployer.sendParameters());
					} else {
						console.log(cyan('Cannot call RewardEscrow.setFeePool() as not owner.'));
					}
				}

				// Skip setting unless redeploying either of these, as
				if (config['Synthetix'].deploy || config['SynthetixEscrow'].deploy) {
					// Note: currently on mainnet SynthetixEscrow.methods.synthetix() does NOT exist
					// it is "havven" and the ABI we have here is not sufficient
					const escrowSNXAddress = await synthetixEscrow.methods.synthetix().call();
					if (escrowSNXAddress !== synthetixAddress) {
						// only the owner can do this
						const synthetixEscrowOwner = await synthetixEscrow.methods.owner().call();

						if (synthetixEscrowOwner === account) {
							console.log(yellow('Invoking SynthetixEscrow.setSynthetix(Synthetix)...'));
							await synthetixEscrow.methods
								.setSynthetix(synthetixAddress)
								.send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `SynthetixEscrow.setSynthetix(Synthetix)`,
								target: synthetixEscrow.options.address,
								action: `setSynthetix(${synthetixAddress})`,
							});
						}
					}
				}

				if (feePool && synthetix) {
					const fpSNXAddress = await feePool.methods.synthetix().call();
					if (fpSNXAddress !== synthetixAddress) {
						// only the owner can do this
						if (feePoolOwner === account) {
							console.log(yellow('Invoking FeePool.setSynthetix(Synthetix)...'));
							await feePool.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `FeePool.setSynthetix(Synthetix)`,
								target: feePool.options.address,
								action: `setSynthetix(${synthetixAddress})`,
							});
						}
					}
				}

				if (supplySchedule && synthetix) {
					const supplyScheduleOwner = await supplySchedule.methods.owner().call();
					// Only owner
					if (supplyScheduleOwner === account) {
						console.log(yellow('Invoking SupplySchedule.setSynthetix(Synthetix)'));
						await supplySchedule.methods
							.setSynthetix(synthetixAddress)
							.send(deployer.sendParameters());
					} else {
						appendOwnerAction({
							key: `SupplySchedule.setSynthetix(Synthetix)`,
							target: supplySchedule.options.address,
							action: `setSynthetix(${synthetixAddress})`,
						});
					}
				}

				// ----------------
				// Synths
				// ----------------
				for (const { name: currencyKey, inverted } of synths) {
					const tokenStateForSynth = await deployContract({
						name: `TokenState${currencyKey}`,
						source: 'TokenState',
						args: [account, ZERO_ADDRESS],
						force: addNewSynths,
					});
					const proxyForSynth = await deployContract({
						name: `Proxy${currencyKey}`,
						source: 'Proxy',
						args: [account],
						force: addNewSynths,
					});
					const synth = await deployContract({
						name: `Synth${currencyKey}`,
						source: 'Synth',
						deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
						args: [
							proxyForSynth ? proxyForSynth.options.address : '',
							tokenStateForSynth ? tokenStateForSynth.options.address : '',
							synthetix ? synthetixAddress : '',
							feePool ? feePool.options.address : '',
							`Synth ${currencyKey}`,
							currencyKey,
							account,
							toBytes4(currencyKey),
						],
						force: addNewSynths,
					});
					const synthAddress = synth ? synth.options.address : '';
					if (synth && tokenStateForSynth) {
						const tsAssociatedContract = await tokenStateForSynth.methods
							.associatedContract()
							.call();
						if (tsAssociatedContract !== synthAddress) {
							const tsOwner = await tokenStateForSynth.methods.owner().call();

							if (tsOwner === account) {
								console.log(
									yellow(
										`Invoking TokenState${currencyKey}.setAssociatedContract(Synth${currencyKey})`
									)
								);

								await tokenStateForSynth.methods
									.setAssociatedContract(synthAddress)
									.send(deployer.sendParameters());
							} else {
								appendOwnerAction({
									key: `TokenState${currencyKey}.setAssociatedContract(Synth${currencyKey})`,
									target: tokenStateForSynth.options.address,
									action: `setAssociatedContract(${synthAddress})`,
								});
							}
						}
					}
					if (proxyForSynth && synth) {
						const target = await proxyForSynth.methods.target().call();
						if (target !== synthAddress) {
							const proxyForSynthOwner = await proxyForSynth.methods.owner().call();

							if (proxyForSynthOwner === account) {
								console.log(yellow(`Invoking Proxy${currencyKey}.setTarget(Synth${currencyKey})`));

								await proxyForSynth.methods.setTarget(synthAddress).send(deployer.sendParameters());
							} else {
								appendOwnerAction({
									key: `Proxy${currencyKey}.setTarget(Synth${currencyKey})`,
									target: proxyForSynth.options.address,
									action: `setTarget(${synthAddress})`,
								});
							}
						}
					}

					if (synth && synthetix) {
						const currentSynthInSNX = await synthetix.methods.synths(toBytes4(currencyKey)).call();
						if (currentSynthInSNX !== synthAddress) {
							// only owner of Synthetix can do this
							if (synthetixOwner === account) {
								console.log(yellow(`Invoking Synthetix.addSynth(Synth${currencyKey})...`));
								await synthetix.methods.addSynth(synthAddress).send(deployer.sendParameters());
							} else {
								appendOwnerAction({
									key: `Synthetix.addSynth(Synth${currencyKey})`,
									target: synthetixAddress,
									action: `addSynth(${synthAddress})`,
								});
							}
						}

						const synthSNXAddress = await synth.methods.synthetix().call();
						const synthOwner = await synth.methods.owner().call();

						// ensure synth has correct Synthetix
						if (synthSNXAddress !== synthetixAddress) {
							if (synthOwner === account) {
								console.log(yellow(`Invoking Synth${currencyKey}.setSynthetix(Synthetix)...`));
								await synth.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
							} else {
								appendOwnerAction({
									key: `Synth${currencyKey}.setSynthetix(Synthetix)`,
									target: synthAddress,
									action: `setSynthetix(${synthetixAddress})`,
								});
							}
						}

						// ensure synth has correct FeePool
						if (synth && feePool) {
							const synthFeePoolAddress = await synth.methods.feePool().call();

							if (synthFeePoolAddress !== feePoolAddress) {
								if (synthOwner === account) {
									console.log(yellow(`Invoking Synth${currencyKey}.setFeePool(FeePool)...`));
									await synth.methods.setFeePool(feePoolAddress).send(deployer.sendParameters());
								} else {
									appendOwnerAction({
										key: `Synth${currencyKey}.setFeePool(FeePool)`,
										target: synthAddress,
										action: `setFeePool(${feePoolAddress})`,
									});
								}
							}
						}

						// now configure inverse synths in exchange rates
						if (inverted) {
							// check total supply
							const totalSynthSupply = await synth.methods.totalSupply().call();
							if (Number(totalSynthSupply) === 0) {
								const {
									entryPoint: currentEP,
									upperLimit: currentUL,
									lowerLimit: currentLL,
								} = await exchangeRates.methods.inversePricing(toBytes4(currencyKey)).call();

								const { entryPoint, upperLimit, lowerLimit } = inverted;

								// only do if not already set
								if (
									w3utils.fromWei(currentEP) !== entryPoint.toString() ||
									w3utils.fromWei(currentUL) !== upperLimit.toString() ||
									w3utils.fromWei(currentLL) !== lowerLimit.toString()
								) {
									const exchangeRatesOwner = await exchangeRates.methods.owner().call();
									if (exchangeRatesOwner === account) {
										console.log(
											yellow(
												`Invoking ExchangeRates.setInversePricing(${currencyKey}, ${entryPoint}, ${upperLimit}, ${lowerLimit})...`
											)
										);
										await exchangeRates.methods
											.setInversePricing(
												toBytes4(currencyKey),
												w3utils.toWei(entryPoint.toString()),
												w3utils.toWei(upperLimit.toString()),
												w3utils.toWei(lowerLimit.toString())
											)
											.send(deployer.sendParameters());
									} else {
										appendOwnerAction({
											key: `ExchangeRates.setInversePricing(${currencyKey}, ${entryPoint}, ${upperLimit}, ${lowerLimit})`,
											target: exchangeRatesAddress,
											action: `setInversePricing(${currencyKey}, ${entryPoint}, ${upperLimit}, ${lowerLimit})`,
										});
									}
								}
							} else {
								console.log(
									gray(
										`Not setting inverse pricing on ${currencyKey} as totalSupply is > 0 (${w3utils.fromWei(
											totalSynthSupply
										)})`
									)
								);
							}
						}
					}
				}

				const depot = await deployContract({
					name: 'Depot',
					deps: ['Synthetix', 'SynthsUSD', 'FeePool'],
					args: [
						account,
						account,
						synthetix ? synthetixAddress : '',
						deployer.deployedContracts['SynthsUSD']
							? deployer.deployedContracts['SynthsUSD'].options.address
							: '',
						feePool ? feePool.options.address : '',
						oracle,
						w3utils.toWei('500'),
						w3utils.toWei('.10'),
					],
				});

				if (synthetix && depot) {
					const depotSNXAddress = await depot.methods.synthetix().call();
					if (depotSNXAddress !== synthetixAddress) {
						const depotOwner = await depot.methods.owner().call();
						if (depotOwner === account) {
							console.log(yellow(`Invoking Depot.setSynthetix()...`));
							await depot.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
						} else {
							appendOwnerAction({
								key: `Depot.setSynthetix(Synthetix)`,
								target: depot.options.address,
								action: `setSynthetix(${synthetixAddress})`,
							});
						}
					}
				}

				console.log(green('\nSuccessfully deployed all contracts!\n'));

				const tableData = Object.keys(deployer.deployedContracts).map(key => [
					key,
					deployer.deployedContracts[key].options.address,
				]);
				console.log();
				console.log(gray(`Tabular data of all contracts on ${network}`));
				console.log(table(tableData));
			}
		);
