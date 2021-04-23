const { artifacts, contract } = require('hardhat');
const { assert } = require('./common');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	proxyThruTo,
	decodedEventEqual,
	getDecodedLogs,
} = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const BaseSynthetixBridge = artifacts.require('BaseSynthetixBridge');

contract('BaseSynthetixBridge (unit tests)', accounts => {
	const [owner, smockedMessenger, flexibleStorage] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: BaseSynthetixBridge.abi,
			ignoreParents: ['Owned', 'Proxyable', 'MixinResolver'],
			expected: ['resumeInitiation', 'suspendInitiation'],
		});
	});

	describe('when all the deps are mocked', () => {
		let messenger;
		let synthetix;
		let resolver;
		let rewardEscrow;
		let proxy;

		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(
				artifacts.require('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2').abi
			);

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);

			proxy = await artifacts.require('Proxy').new(owner);
			// now add to address resolver
			resolver = await artifacts.require('AddressResolver').new(owner);

			await resolver.importAddresses(
				['ext:Messenger', 'Synthetix', 'RewardEscrowV2', 'FlexibleStorage'].map(toBytes32),
				[messenger.address, synthetix.address, rewardEscrow.address, flexibleStorage],
				{ from: owner }
			);
		});

		describe('when the target is deployed and the proxy is set', () => {
			let instance;

			beforeEach(async () => {
				instance = await artifacts
					.require('BaseSynthetixBridge')
					.new(proxy.address, owner, resolver.address);

				await instance.rebuildCache();

				await proxy.setTarget(instance.address, { from: owner });
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.proxy(), proxy.address);
				assert.equal(await instance.owner(), owner);
			});

			it('initially initiations are active', async () => {
				assert.equal(await instance.initiationActive(), true);
			});

			describe('suspendInitiation', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.suspendInitiation,
							args: [],
							accounts,
							reason: 'Owner only function',
							address: owner,
						});
					});

					it('reverts when initiation is already suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.suspendInitiation({ from: owner }),
							'initiation suspended'
						);
					});
				});

				describe('when invoked by the owner directly', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.suspendInitiation({ from: owner });
					});

					it('and initiationActive is false', async () => {
						assert.equal(await instance.initiationActive(), false);
					});

					it('and a InitiationSuspended event is emitted', async () => {
						assert.eventEqual(txn, 'InitiationSuspended', []);
					});
				});

				describe('when invoked by the owner via the proxy', () => {
					let hash;
					beforeEach(async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'suspendInitiation',
							user: owner,
							args: [],
						});
						hash = txHash;
					});

					it('initiationActive is false', async () => {
						assert.equal(await instance.initiationActive(), false);
					});

					it('and an InitiationSuspended event is emitted', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });

						decodedEventEqual({
							log: logs[0],
							event: 'InitiationSuspended',
							emittedFrom: proxy.address,
							args: [],
						});
					});
				});
			});

			describe('resumeInitiation', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						// first suspend initiations
						await instance.suspendInitiation({ from: owner });
						await onlyGivenAddressCanInvoke({
							fnc: instance.resumeInitiation,
							args: [],
							accounts,
							reason: 'Owner only function',
							address: owner,
						});
					});

					it('reverts when initiation is not suspended', async () => {
						await assert.revert(
							instance.resumeInitiation({ from: owner }),
							'initiation not suspended'
						);
					});
				});

				describe('when initiation is suspended', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.suspendInitiation({ from: owner });
					});

					it('initiationActive is false', async () => {
						assert.equal(await instance.initiationActive(), false);
					});

					describe('when invoked by the owner directly', () => {
						beforeEach(async () => {
							txn = await instance.resumeInitiation({ from: owner });
						});

						it('initiations are active again', async () => {
							assert.equal(await instance.initiationActive(), true);
						});

						it('a InitiationResumed event is emitted', async () => {
							assert.eventEqual(txn, 'InitiationResumed', []);
						});
					});

					describe('when invoked by the owner via the proxy', () => {
						let hash;
						beforeEach(async () => {
							const { tx: txHash } = await proxyThruTo({
								proxy,
								target: instance,
								fncName: 'resumeInitiation',
								user: owner,
								args: [],
							});
							hash = txHash;
						});

						it('initiationActive is true', async () => {
							assert.equal(await instance.initiationActive(), true);
						});

						it('and a InitiationResumed event is emitted', async () => {
							const logs = await getDecodedLogs({ hash, contracts: [instance] });

							decodedEventEqual({
								log: logs[0],
								event: 'InitiationResumed',
								emittedFrom: proxy.address,
								args: [],
							});
						});
					});
				});
			});
		});
	});
});
