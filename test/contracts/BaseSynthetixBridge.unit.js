const { artifacts, contract } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const { toUnit } = require('../utils')();

const BaseSynthetixBridge = artifacts.require('BaseSynthetixBridge');

contract('BaseSynthetixBridge (unit tests)', accounts => {
	const [, owner, user1, smockedMessenger] = accounts;

	const [sUSD, sETH] = [toBytes32('sUSD'), toBytes32('sETH')];

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: BaseSynthetixBridge.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'resumeInitiation',
				'suspendInitiation',
				'initiateSynthTransfer',
				'finalizeSynthTransfer',
			],
		});
	});

	describe('when all the deps are mocked', () => {
		let messenger;
		let synthetix;
		let resolver;
		let issuer;
		let exchangeRates;
		let feePool;
		let rewardEscrow;
		let flexibleStorage;
		let systemStatus;

		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(
				artifacts.require('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2').abi
			);

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);

			feePool = await smockit(artifacts.require('FeePool').abi);

			issuer = await smockit(artifacts.require('Issuer').abi);
			exchangeRates = await smockit(artifacts.require('ExchangeRates').abi);
			systemStatus = await smockit(artifacts.require('SystemStatus').abi);
			flexibleStorage = await smockit(artifacts.require('FlexibleStorage').abi);

			resolver = await artifacts.require('AddressResolver').new(owner);

			await resolver.importAddresses(
				[
					'ext:Messenger',
					'Synthetix',
					'RewardEscrowV2',
					'FlexibleStorage',
					'Issuer',
					'ExchangeRates',
					'FeePool',
					'base:SynthetixBridgeToOptimism',
					'SystemStatus',
				].map(toBytes32),
				[
					messenger.address,
					synthetix.address,
					rewardEscrow.address,
					flexibleStorage.address,
					issuer.address,
					exchangeRates.address,
					feePool.address,
					issuer.address,
					systemStatus.address,
				],
				{ from: owner }
			);
		});

		describe('when the target is deployed and the proxy is set', () => {
			let instance;

			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToBase') // have to use a sub-contract becuase `BaseSynthetixBridge` is abstract
					.new(owner, resolver.address);

				await instance.rebuildCache();
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.resolver(), resolver.address);
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
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});

					it('reverts when initiation is already suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.suspendInitiation({ from: owner }),
							'Initiation suspended'
						);
					});
				});

				describe('when invoked by the owner', () => {
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
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});

					it('reverts when initiation is not suspended', async () => {
						await assert.revert(
							instance.resumeInitiation({ from: owner }),
							'Initiation not suspended'
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

					describe('when invoked by the owner', () => {
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
				});
			});

			describe('initiateSynthTransfer', () => {
				it('fails if requested synth is not enabled for cross chain transfer', async () => {
					await assert.revert(
						instance.initiateSynthTransfer(sETH, user1, toUnit('50'), { from: owner }),
						'Synth not enabled for cross chain transfer'
					);
				});

				it('fails if synth is not enabled', async () => {
					flexibleStorage.smocked.getUIntValue.will.return.with(toUnit('50').toString());
					systemStatus.smocked.requireSynthActive.will.revert.with('suspended');

					await assert.revert(
						instance.initiateSynthTransfer(sETH, user1, toUnit('50'), { from: owner }),
						'unexpected'
					);
				});

				describe('when enabled for cross chain transfer', () => {
					let txn;

					beforeEach('run synth transfer calls', async () => {
						// fake the value that would be set by first `initiateSynthTransfer`
						// this also simultaneously enables synth trade
						flexibleStorage.smocked.getUIntValue.will.return.with(toUnit('50').toString());

						// two initiate calls to verify summation
						await instance.initiateSynthTransfer(sETH, user1, toUnit('50'), { from: owner });

						txn = await instance.initiateSynthTransfer(sUSD, owner, toUnit('100'), { from: user1 });
					});

					it('fails if initiation is not active', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.initiateSynthTransfer(sETH, user1, toUnit('50'), { from: owner }),
							'Initiation deactivated'
						);
					});

					it('burns synths from caller', () => {
						assert.bnEqual(issuer.smocked.burnSynthsWithoutDebt.calls[0].amount, toUnit('100'));
					});

					it('calls messenger', () => {
						assert.bnEqual(messenger.smocked.sendMessage.calls[0]._target, issuer.address);
					});

					it('increments synthTransferSent', async () => {
						assert.bnEqual(flexibleStorage.smocked.setUIntValue.calls[0].value, toUnit('150'));
					});

					it('emits event', () => {
						assert.eventEqual(txn, 'InitiateSynthTransfer', [sUSD, owner, toUnit('100')]);
					});
				});
			});

			describe('finalizeSynthTransfer', () => {
				beforeEach('set counterpart bridge', async () => {
					messenger.smocked.xDomainMessageSender.will.return.with(issuer.address);
				});

				it('fails if xdomainmessagesender doesnt match counterpart', async () => {
					messenger.smocked.xDomainMessageSender.will.return.with(owner);
					await assert.revert(instance.finalizeSynthTransfer(sUSD, owner, '100'));
				});

				it('can only be called by messenger and registered counterpart', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: instance.finalizeSynthTransfer,
						accounts,
						address: smockedMessenger,
						args: [sUSD, owner, '100'],
						reason: 'Only the relayer can call this',
					});
				});

				describe('when successfully invoked', () => {
					let txn;
					beforeEach(async () => {
						// fake the value that would be set by previous `finalizeSynthTransfer`
						flexibleStorage.smocked.getUIntValue.will.return.with(toUnit('50').toString());

						// two calls to verify summation
						await instance.finalizeSynthTransfer(sETH, owner, toUnit('50'), {
							from: smockedMessenger,
						});

						txn = await instance.finalizeSynthTransfer(sUSD, user1, toUnit('125'), {
							from: smockedMessenger,
						});
					});

					it('mints synths to the destination', () => {
						assert.bnEqual(issuer.smocked.issueSynthsWithoutDebt.calls[0].amount, toUnit('125'));
					});

					it('increments synthTransferReceived', async () => {
						assert.bnEqual(flexibleStorage.smocked.setUIntValue.calls[0].value, toUnit('175'));
					});

					it('emits event', () => {
						assert.eventEqual(txn, 'FinalizeSynthTransfer', [sUSD, user1, toUnit('125')]);
					});
				});
			});

			describe('synthTransferSent & synthTransferReceived', () => {
				beforeEach('set fake values', () => {
					// create some fake synths
					issuer.smocked.availableCurrencyKeys.will.return.with([sUSD, sETH]);

					// set some exchange rates
					exchangeRates.smocked.ratesAndInvalidForCurrencies.will.return.with([
						[toUnit('1').toString(), toUnit('3').toString()],
						false,
					]);

					// set flexible storage to a fake value
					flexibleStorage.smocked.getUIntValues.will.return.with([
						toUnit('100').toString(),
						toUnit('200').toString(),
					]);
				});

				it('reverts if rates are innaccurate', async () => {
					exchangeRates.smocked.ratesAndInvalidForCurrencies.will.return.with([
						[toUnit('1').toString(), toUnit('3').toString()],
						true,
					]);

					await assert.revert(instance.synthTransferSent(), 'Rates are invalid');
				});

				it('correctly sums', async () => {
					assert.bnEqual(await instance.synthTransferSent(), toUnit(700));
					assert.bnEqual(await instance.synthTransferReceived(), toUnit(700));
				});
			});
		});
	});
});
