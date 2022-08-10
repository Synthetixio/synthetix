'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

const { setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');

contract('CircuitBreaker (contract)', async accounts => {
	const [, owner, , , issuer, fakeAggregator] = accounts;

	let addressResolver, systemSettings, systemStatus, circuitBreaker;

	beforeEach(async () => {
		({
			AddressResolver: addressResolver,
			CircuitBreaker: circuitBreaker,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			contracts: ['CircuitBreaker', 'ExchangeRates', 'SystemSettings'],
		}));

		// fake issuer
		await addressResolver.importAddresses([toBytes32('Issuer')], [issuer], { from: owner });
		await circuitBreaker.rebuildCache();

		// test assumes price deviation threshold of 2
		await systemSettings.setPriceDeviationThresholdFactor(toUnit(2), { from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: circuitBreaker.abi,
			hasFallback: false,
			ignoreParents: ['Owned', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['probeCircuitBreaker', 'resetLastValue'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = circuitBreaker;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
			assert.equal(await instance.owner(), owner);
		});

		it('should not be payable', async () => {
			await assert.revert(
				web3.eth.sendTransaction({
					value: toUnit('1'),
					from: owner,
					to: instance.address,
				})
			);
		});
	});

	describe('probeCircuitBreaker()', async () => {
		it('only authorized callers can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: circuitBreaker.probeCircuitBreaker,
				args: [fakeAggregator, toUnit(1)],
				accounts,
				address: issuer,
				reason: 'Only internal contracts',
			});
		});

		it('isInvalid() returns false for new feed', async () => {
			assert.equal(await circuitBreaker.isInvalid(fakeAggregator, toUnit(1)), false);
		});

		describe('when invoke new feed with starting price of 0', () => {
			beforeEach(async () => {
				await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(0), { from: issuer });
			});

			it('circuit is broken', async () => {
				assert.equal(await circuitBreaker.circuitBroken(fakeAggregator), true);
			});
		});

		describe('when successfully invoked with a new feed', () => {
			let txn;
			beforeEach(async () => {
				txn = await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(1), { from: issuer });
			});

			it('records lastValue', async () => {
				assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(1));
			});

			it('circuit is unbroken', async () => {
				assert.equal(await circuitBreaker.circuitBroken(fakeAggregator), false);
			});

			it('does not emit circuit broken event', async () => {
				const e = txn.logs.find(log => log.event === 'CircuitBroken');
				assert.notOk(e);
			});

			it('isInvalid() returns false for valid change', async () => {
				assert.equal(await circuitBreaker.isInvalid(fakeAggregator, toUnit(1.5)), false);
			});

			it('isInvalid() returns false for invalid change', async () => {
				assert.equal(await circuitBreaker.isInvalid(fakeAggregator, toUnit(2.5)), true);
			});

			describe('when successfully invoked and feed is within recent price range', () => {
				beforeEach(async () => {
					txn = await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(1.5), {
						from: issuer,
					});
				});

				it('records lastValue', async () => {
					assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(1.5));
				});

				it('circuit is unbroken', async () => {
					assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), false);
				});

				it('does not emit circuit broken event', async () => {
					const e = txn.logs.find(log => log.event === 'CircuitBroken');
					assert.notOk(e);
				});
			});

			describe('when successfully invoked, system is suspended, and feed is outside recent price range', () => {
				beforeEach('suspend system', async () => {
					await systemStatus.suspendSystem(1, { from: owner });
				});

				beforeEach(async () => {
					txn = await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(2.5), {
						from: issuer,
					});
				});

				it('circuit is not broken', async () => {
					assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), false);
				});
			});

			describe('when successfully invoked and feed is outside recent price range', () => {
				beforeEach(async () => {
					txn = await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(2.5), {
						from: issuer,
					});
				});

				it('records lastValue', async () => {
					assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(2.5));
				});

				it('circuit is broken', async () => {
					assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), true);
				});

				it('emits circuit broken event', async () => {
					assert.eventEqual(txn, 'CircuitBroken', [fakeAggregator, toUnit(1), toUnit(2.5)]);
				});

				describe('when invoked again and price is back inside', () => {
					beforeEach(async () => {
						txn = await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(1), {
							from: issuer,
						});
					});

					it('records lastValue', async () => {
						assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(1));
					});

					it('circuit remains broken', async () => {
						assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), true);
					});

					it('does not emit circuit broken event', async () => {
						const e = txn.logs.find(log => log.event === 'CircuitBroken');
						assert.notOk(e);
					});
				});
			});
		});
	});

	describe('resetLastValue', async () => {
		it('only authorized callers can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: circuitBreaker.resetLastValue,
				args: [[fakeAggregator], [toUnit(1)]],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		let txn;
		describe('when successfully invoked with a new feed', () => {
			beforeEach(async () => {
				txn = await circuitBreaker.resetLastValue([fakeAggregator], [toUnit(2)], { from: owner });
			});

			it('records lastValue to specified', async () => {
				assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(2));
			});

			it('circuit is unbroken', async () => {
				assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), false);
			});

			it('emits overridden', async () => {
				assert.eventEqual(txn, 'LastValueOverridden', [fakeAggregator, toUnit(0), toUnit(2)]);
			});
		});

		describe('when successfully invoked with existing feed that is broken', () => {
			beforeEach(async () => {
				await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(1), { from: issuer });
				await circuitBreaker.probeCircuitBreaker(fakeAggregator, toUnit(2), { from: issuer });

				// sanity
				assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), true);

				txn = await circuitBreaker.resetLastValue([fakeAggregator], [toUnit(1)], { from: owner });
			});

			it('records lastValue to specified', async () => {
				assert.bnEqual(await circuitBreaker.lastValue(fakeAggregator), toUnit(1));
			});

			it('circuit is unbroken', async () => {
				assert.bnEqual(await circuitBreaker.circuitBroken(fakeAggregator), false);
			});

			it('emits overridden event', async () => {
				assert.eventEqual(txn, 'LastValueOverridden', [fakeAggregator, toUnit(2), toUnit(1)]);
			});
		});
	});

	describe('priceDeviationThresholdFactor()', () => {
		it('reports same value as systemSettings', async () => {
			assert.bnEqual(
				await circuitBreaker.priceDeviationThresholdFactor(),
				await systemSettings.priceDeviationThresholdFactor()
			);

			await systemSettings.setPriceDeviationThresholdFactor(toUnit(101010), { from: owner });

			assert.bnEqual(
				await circuitBreaker.priceDeviationThresholdFactor(),
				await systemSettings.priceDeviationThresholdFactor()
			);
		});
	});

	describe('isDeviationAboveThreshold()', () => {
		it('works at 0', async () => {
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(0), toUnit(0)), true);
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(0), toUnit(1)), true);
		});

		it('works below threshold', async () => {
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(1)), false);
			assert.bnEqual(
				await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(1.01)),
				false
			);
			assert.bnEqual(
				await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0.99)),
				false
			);
			assert.bnEqual(
				await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(1.99)),
				false
			);
			assert.bnEqual(
				await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0.51)),
				false
			);
		});
		it('works at threshold', async () => {
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(2)), true);
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0.5)), true);
		});
		it('works above threshold', async () => {
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(2.01)), true);
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(2000)), true);

			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0)), true);
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0.1)), true);
			assert.bnEqual(await circuitBreaker.isDeviationAboveThreshold(toUnit(1), toUnit(0.49)), true);
		});
	});
});
