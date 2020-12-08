const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ethers = require('ethers');
const axios = require('axios');

const { parseEther } = ethers.utils;

const { assert } = require('../contracts/common');
const testUtils = require('../utils');
const { ensureDeploymentPath, loadAndCheckRequiredSources } = require('../../publish/src/util');

const { wrap, constants, toBytes32 } = require('../..');

const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('L1/L2 integration', () => {
	let setupProvider, getContract;

	const overrides = {
		gasPrice: '0',
		gasLimit: 1.5e6,
	};

	const network = 'local';
	const { getPathToNetwork } = wrap({ path, fs, network });

	const wallets = [];
	const deploymentPaths = [];
	let currentDeploymentPath;
	let deployerPrivateKey;
	let l1Provider;

	const createTempLocalCopy = ({ prefix, useOvm }) => {
		const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		fs.copySync(getPathToNetwork({ network: 'goerli', useOvm: useOvm }), folderPath);
		fs.writeFileSync(
			path.join(folderPath, constants.DEPLOYMENT_FILENAME),
			JSON.stringify({ targets: {}, sources: {} }, null, '\t')
		);

		return folderPath;
	};

	const prepareFreshDeployment = (network = 'local', deploymentPath) => {
		ensureDeploymentPath(deploymentPath);
		// get the (local) config file
		const { config, configFile } = loadAndCheckRequiredSources({
			deploymentPath,
			network,
		});
		// switch to true
		Object.keys(config).map(source => {
			config[source] = { deploy: true };
		});
		fs.writeFileSync(configFile, JSON.stringify(config));
	};

	// fetches an array of both instance contracts
	const fetchContract = ({ contract, source = contract, instance, user }) =>
		getContract({
			contract,
			source,
			network,
			deploymentPath: deploymentPaths[instance],
			wallet: user || wallets[instance],
		});

	const connectBridgesAndSyncCaches = async (
		l1MessengerAddress,
		l2MessengerAddress,
		l1ToL2Bridge,
		l2ToL1Bridge
	) => {
		let importedContracts = ['ext:Messenger', 'ovm:SynthetixBridgeToBase'];
		let importedAddresses = [l1MessengerAddress, l2ToL1Bridge.address];
		let addressResolver = fetchContract({ contract: 'AddressResolver', instance: 0 });
		await addressResolver.importAddresses(
			importedContracts.map(toBytes32),
			importedAddresses,
			overrides
		);
		await l1ToL2Bridge.setResolverAndSyncCache(addressResolver.address, overrides);

		importedContracts = ['ext:Messenger', 'base:SynthetixBridgeToOptimism'];
		importedAddresses = [l2MessengerAddress, l1ToL2Bridge.address];
		addressResolver = fetchContract({ contract: 'AddressResolver', instance: 1 });
		await addressResolver.importAddresses(
			importedContracts.map(toBytes32),
			importedAddresses,
			overrides
		);
		await l2ToL1Bridge.setResolverAndSyncCache(addressResolver.address, overrides);
	};

	before('set up test utils', async () => {
		({ setupProvider, getContract } = testUtils());
	});

	before('setup providers and deployer wallets', async () => {
		({ wallet: wallets[0], provider: l1Provider } = setupProvider({
			providerUrl: 'http://127.0.0.1:9545',
		}));

		({ wallet: wallets[1] } = setupProvider({
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: wallets[0].privateKey,
		}));

		deployerPrivateKey = wallets[0].privateKey;
	});

	before('deploy instance on L1', async () => {
		currentDeploymentPath = createTempLocalCopy({ prefix: 'snx-docker-local-1-' });
		// console.log(currentDeploymentPath);
		deploymentPaths.push(currentDeploymentPath);
		// ensure that we do a fresh deployment
		prepareFreshDeployment(network, currentDeploymentPath);
		// compile contracts
		await commands.build({ showContractSize: true });

		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			providerUrl: 'http://127.0.0.1:9545',
			privateKey: deployerPrivateKey,
			deploymentPath: currentDeploymentPath,
			gasPrice: '0',
		});
	});

	before('deploy an OVM instance', async () => {
		currentDeploymentPath = createTempLocalCopy({
			prefix: 'snx-docker-local-2-ovm-',
			useOvm: true,
		});
		// console.log(currentDeploymentPath);
		deploymentPaths.push(currentDeploymentPath);
		// ensure that we do a fresh deployment
		prepareFreshDeployment(network, currentDeploymentPath);
		// compile with the useOVM flag set
		await commands.build({ showContractSize: true, useOvm: true });

		await commands.deploy({
			network,
			freshDeploy: true,
			yes: true,
			providerUrl: 'http://127.0.0.1:8545',
			privateKey: deployerPrivateKey,
			useOvm: true,
			deploymentPath: currentDeploymentPath,
			methodCallGasLimit: '2500000',
			contractDeploymentGasLimit: '11000000',
			gasPrice: '0',
			ensureOvmDeploymentGasLimit: true,
		});
	});

	describe('when both instances are deployed', () => {
		let mintableSynthetix, synthetix;
		let l2InitialTotalSupply;

		before('fetch Synthetix instances', async () => {
			synthetix = fetchContract({
				contract: 'Synthetix',
				source: 'Synthetix',
				instance: 0,
			});

			mintableSynthetix = fetchContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				instance: 1,
			});

			l2InitialTotalSupply = await mintableSynthetix.totalSupply();
		});

		it('the totalSupply on L2 should be right', async () => {
			assert.bnEqual(l2InitialTotalSupply, parseEther('100000000'));
		});

		describe('the address resolver is updated and the caches are synched on both layers', () => {
			before('fetch the required addresses and connect bridges', async () => {
				let predeployedContracts;
				await axios.get('http://localhost:8080/addresses.json').then(
					response => {
						predeployedContracts = response.data;
					},
					error => {
						console.log(error);
					}
				);
				// fetch messenger
				const l1ToL2MessengerAddress = predeployedContracts['OVM_L2CrossDomainMessenger'];
				const l2ToL1MessengerAddress = predeployedContracts['OVM_L1CrossDomainMessenger'];
				// fetch bridges
				const l1ToL2Bridge = fetchContract({ contract: 'SynthetixBridgeToOptimism', instance: 0 });
				const l2ToL1Bridge = fetchContract({ contract: 'SynthetixBridgeToBase', instance: 1 });

				await connectBridgesAndSyncCaches(
					l1ToL2MessengerAddress,
					l2ToL1MessengerAddress,
					l1ToL2Bridge,
					l2ToL1Bridge
				);
			});

			describe('when a user owns SNX on L1', () => {
				let accounts, user;

				before('transfer SNX to user', async () => {
					accounts = await l1Provider.listAccounts();
					user = l1Provider.getSigner(accounts[3]); // use 3rd account to avoid conflicts with the sequencer
					await (await synthetix.transfer(user._address, parseEther('100'), overrides)).wait();
				});

				it('should update the user balance', async () => {
					assert.bnEqual(await synthetix.balanceOf(user._address), parseEther('100'));
				});

				describe('when a user deposits SNX into the L1 bridge', () => {
					let l1ToL2Bridge;
					before('approve and deposit 100 SNX', async () => {
						l1ToL2Bridge = fetchContract({
							contract: 'SynthetixBridgeToOptimism',
							instance: 0,
							user,
						});
						// user must approve SynthetixBridgeToOptimism to transfer SNX on their behalf
						await (
							await fetchContract({ contract: 'Synthetix', instance: 0, user }).approve(
								l1ToL2Bridge.address,
								parseEther('10'),
								overrides
							)
						).wait();

						await (await l1ToL2Bridge.deposit(parseEther('10'), overrides)).wait();
					});

					it('the balances should be updated accordingly', async () => {
						assert.bnEqual(await synthetix.balanceOf(l1ToL2Bridge.address), parseEther('10'));
						assert.bnEqual(await synthetix.balanceOf(user._address), parseEther('90'));
					});

					describe('when the message is relayed to L2', () => {
						it('the amount should be credited', async () => {
							assert.bnEqual(await mintableSynthetix.balanceOf(user._address), parseEther('10'));
						});
					});

					describe('when the user initiates a withdrawal', () => {
						let l2ToL1Bridge;
						describe('when the user owns SNX', () => {
							before('credit user with SNX', async () => {
								await (
									await mintableSynthetix.transfer(user._address, parseEther('100'), overrides)
								).wait();
							});

							it('the user balance should be updated accordingly', async () => {
								assert.bnEqual(await mintableSynthetix.balanceOf(user._address), parseEther('100'));
							});

							describe('when the user tries to withdraw', () => {
								before('initiate withdrawal', async () => {
									l2ToL1Bridge = fetchContract({
										contract: 'SynthetixBridgeToBase',
										instance: 1,
										user,
									});
									// initiate withdrawal on L2
									await l2ToL1Bridge.initiateWithdrawal(parseEther('10'), overrides);
								});

								it('the balances should be updated accordingly', async () => {
									assert.bnEqual(
										await mintableSynthetix.balanceOf(user._address),
										parseEther('90')
									);
								});
							});
						});
					});
				});
			});
		});
	});
});
