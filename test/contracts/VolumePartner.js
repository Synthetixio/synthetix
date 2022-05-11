const { contract } = require('hardhat');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toBytes32, constants: { ZERO_ADDRESS } } = require('../..');
const { setupPriceAggregators, setExchangeFeeRateForSynths, updateAggregatorRates } = require('./helpers');
const { toUnit, toBN } = require('../utils')();

contract('VolumePartner', accounts => {
    const [sUSD, sAUD] = ['sUSD', 'sAUD'].map(toBytes32);
    const exchangeFeeRate = toUnit('0.02');
    const synthKeys = [sAUD];
    const [deployerAccount, owner, relayer, account1, account2] = accounts;
    let volumePartner, systemSettings, exchanger, exchangeRates, synthetix, sUSDContract;

    describe('For normal exchanges', () => {

        before(async () => {
            ({ SystemSettings: systemSettings, VolumePartner: volumePartner, Exchanger: exchanger, ExchangeRates: exchangeRates, Synthetix: synthetix, SynthsUSD: sUSDContract } = await setupAllContracts({
                accounts,
                synths: ['sUSD', 'sAUD'],
                contracts: ['FuturesMarketManager', 'Exchanger', 'Issuer', 'VolumePartner', 'ExchangeRates', 'Synthetix']
            }));
            await systemSettings.setMaxVolumePartnerFee(toUnit('0.1'), {
                from: owner,
            });

            await setupPriceAggregators(exchangeRates, owner, [sAUD]);
            await updateAggregatorRates(exchangeRates, [sAUD], ['0.5'].map(toUnit));
            await setExchangeFeeRateForSynths({
                owner,
                systemSettings,
                synthKeys,
                exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
            });
        });

        describe('Registering volume partner codes ', () => {
            it('Can register a volume partner code', async () => {
                const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE1'))
                assert.bnEqual(resp1.owner, ZERO_ADDRESS);

                const transaction = await volumePartner.registerVolumePartnerCode(toBytes32('CODE1'), account1, toUnit('0.01'), { from: owner });
                assert.eventEqual(transaction, 'VolumePartnerCodeRegistered', { volumePartnerCode: toBytes32('CODE1'), owner: account1, caller: owner, feeRate: toUnit('0.01') });

                const resp2 = await volumePartner.volumePartnerData(toBytes32('CODE1'))
                assert.bnEqual(resp2.owner, account1);

                const resp3 = await volumePartner.getFeeRate(toBytes32('CODE1'))
                assert.bnEqual(resp3, toUnit('0.01'));
            });

            it('Cannot register a claimed volume partner code', async () => {
                const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE2'))
                assert.bnEqual(resp1.owner, ZERO_ADDRESS);

                await volumePartner.registerVolumePartnerCode(toBytes32('CODE2'), account1, toUnit('0.01'));

                const resp2 = await volumePartner.volumePartnerData(toBytes32('CODE2'))
                assert.bnEqual(resp2.owner, account1);

                await assert.revert(
                    volumePartner.registerVolumePartnerCode(toBytes32('CODE2'), account2, toUnit('0.01')),
                    'This volume partner code has already been registered.'
                );
            });

            it('Cannot register a volume partner code to the zero address', async () => {
                const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE3'))
                assert.bnEqual(resp1.owner, ZERO_ADDRESS);

                await assert.revert(
                    volumePartner.registerVolumePartnerCode(toBytes32('CODE3'), ZERO_ADDRESS, toUnit('0.01')),
                    'Owner cannot be the zero address.'
                );
            });

            it('Can register a volume partner code with a fee rate equal to the maximum', async () => {
                await volumePartner.registerVolumePartnerCode(toBytes32('CODE4'), account1, toUnit('0.1'));
                const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE4'))
                assert.bnEqual(resp1.owner, account1);
            });

            it('Cannot register a volume partner code with a fee rate higher than the maximum', async () => {
                await assert.revert(
                    volumePartner.registerVolumePartnerCode(toBytes32('CODE5'), account1, toUnit('0.11')),
                    'Fee rate must be less than or equal to the maximum.'
                );
            });
        });

        describe('Updating fee rate', () => {
            it('Can update when the owner', async () => {
                await volumePartner.registerVolumePartnerCode(toBytes32('CODE6'), account1, toUnit('0.1'));

                const resp1 = await volumePartner.getFeeRate(toBytes32('CODE6'))
                assert.bnEqual(resp1, toUnit('0.1'));

                const transaction = await volumePartner.updateFeeRate(toBytes32('CODE6'), toUnit('0.01'), { from: account1 });
                assert.eventEqual(transaction, 'FeeRateUpdated', { volumePartnerCode: toBytes32('CODE6'), caller: account1, feeRate: toUnit('0.01') });

                const resp2 = await volumePartner.getFeeRate(toBytes32('CODE6'))
                assert.bnEqual(resp2, toUnit('0.01'));
            })

            it('Cannot update when greater than the max', async () => {
                await volumePartner.registerVolumePartnerCode(toBytes32('CODE7'), account1, toUnit('0.1'));

                const resp1 = await volumePartner.getFeeRate(toBytes32('CODE7'))
                assert.bnEqual(resp1, toUnit('0.1'));

                await assert.revert(
                    volumePartner.updateFeeRate(toBytes32('CODE7'), toUnit('0.2'), { from: account1 }),
                    'Fee rate must be less than or equal to the maximum.'
                );
            })

            it('Cannot update when not the owner', async () => {
                await volumePartner.registerVolumePartnerCode(toBytes32('CODE8'), account1, toUnit('0.1'));

                const resp1 = await volumePartner.getFeeRate(toBytes32('CODE8'))
                assert.bnEqual(resp1, toUnit('0.1'));

                await assert.revert(
                    volumePartner.updateFeeRate(toBytes32('CODE8'), toUnit('0.01'), { from: account2 }),
                    'You are not the owner of this volume partner code'
                );
            })
        });

        it('Can transfer ownership of a volume partner code', async () => {
            await volumePartner.registerVolumePartnerCode(toBytes32('CODE9'), account1, toUnit('0.01'));
            const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE9'))
            assert.bnEqual(resp1.nominatedOwner, ZERO_ADDRESS);

            await assert.revert(
                volumePartner.nominateOwner(toBytes32('CODE9'), account2),
                'You are not the owner of this volume partner code'
            );

            const transaction1 = await volumePartner.nominateOwner(toBytes32('CODE9'), account2, { from: account1 });
            assert.eventEqual(transaction1, 'OwnerNominated', { volumePartnerCode: toBytes32('CODE9'), nominee: account2 });

            const resp2 = await volumePartner.volumePartnerData(toBytes32('CODE9'))

            assert.bnEqual(resp2.nominatedOwner, account2);

            await assert.revert(
                volumePartner.acceptOwnership(toBytes32('CODE9'), { from: account1 }),
                'You are not the nominated owner of this volume partner code'
            );

            const transaction2 = await volumePartner.acceptOwnership(toBytes32('CODE9'), { from: account2 });
            assert.eventEqual(transaction2, 'OwnershipAccepted', { volumePartnerCode: toBytes32('CODE9'), previousOwner: account1, newOwner: account2 });

            const resp3 = await volumePartner.volumePartnerData(toBytes32('CODE9'))
            assert.bnEqual(resp3.owner, account2);
            assert.bnEqual(resp3.nominatedOwner, ZERO_ADDRESS);
        })

        it('Cannot accrue fees from an external address', async () => {
            await assert.revert(
                volumePartner.accrueFee(toBytes32('CODE10'), 100, { from: account1 }),
                'Only Internal Contracts'
            );
        })

        it('Can accrue and claim fees from a normal exchange', async () => {
            await volumePartner.registerVolumePartnerCode(toBytes32('CODE11'), account1, toUnit('0.01'));

            const amount = toUnit('10000');
            await sUSDContract.issue(account1, amount);

            const { exchangeFeeRate: exchangeFeeRate1 } = await exchanger.getAmountsForExchangeWithTrackingCode(
                amount,
                sUSD,
                sAUD,
                toBytes32('CODE11')
            );

            assert.bnEqual(exchangeFeeRate1, toUnit('0.03')); // Sum of fee rates

            await synthetix.exchangeWithTracking(sUSD, amount, sAUD, ZERO_ADDRESS, toBytes32('CODE11'), { from: account1 });

            const expectedPartnerFee = amount.div(toBN(100)); // Should be 1% of the exchange amount, per toUnit('0.01')

            const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE11'))
            assert.bnEqual(resp1.balance, expectedPartnerFee)

            await assert.revert(
                volumePartner.claimFees(toBytes32('CODE11'), account2, { from: account2 }),
                "You are not the owner of this volume partner code"
            );
            await assert.revert(
                volumePartner.claimFees(toBytes32('CODE11'), ZERO_ADDRESS, { from: account1 }),
                "Recipient cannot be the zero address."
            );

            const transaction = await volumePartner.claimFees(toBytes32('CODE11'), account2, { from: account1 })
            assert.eventEqual(transaction, 'FeesClaimed', { volumePartnerCode: toBytes32('CODE11'), caller: account1, recipient: account2, amount: expectedPartnerFee });

            assert.bnEqual(await sUSDContract.balanceOf(account2), expectedPartnerFee)

            const resp2 = await volumePartner.volumePartnerData(toBytes32('CODE11'))
            assert.bnEqual(resp2.balance, toBN('0'))

            await assert.revert(
                volumePartner.claimFees(toBytes32('CODE11'), account2, { from: account1 }),
                "This volume partner code has no fees available."
            );
        });
    });

    describe('For atomic exchanges', () => {
        before(async () => {
            ({ SystemSettings: systemSettings, VolumePartner: volumePartner, Exchanger: exchanger, ExchangeRates: exchangeRates, Synthetix: synthetix, SynthsUSD: sUSDContract } = await setupAllContracts({
                accounts,
                synths: ['sUSD', 'sAUD'],
                contracts: ['ExchangerWithFeeRecAlternatives', 'ExchangeRatesWithDexPricing', 'FuturesMarketManager', 'Issuer', 'VolumePartner', 'Synthetix']
            }));
            await systemSettings.setMaxVolumePartnerFee(toUnit('0.1'), {
                from: owner,
            });

            const keys = [sAUD];
            const rates = ['0.5'].map(toUnit);
            await setupPriceAggregators(exchangeRates, owner, keys);
            await updateAggregatorRates(exchangeRates, keys, rates);

            await setExchangeFeeRateForSynths({
                owner,
                systemSettings,
                synthKeys,
                exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
            });

            await systemSettings.setPureChainlinkPriceForAtomicSwapsEnabled(
                sUSD,
                true,
                {
                    from: owner,
                }
            );
            await systemSettings.setPureChainlinkPriceForAtomicSwapsEnabled(
                sAUD,
                true,
                {
                    from: owner,
                }
            );
        });

        it('Can accrue fees from an atomic exchange', async () => {
            await volumePartner.registerVolumePartnerCode(toBytes32('CODE12'), account1, toUnit('0.02'));

            const amount = toUnit('10000');
            await sUSDContract.issue(account1, amount);

            await synthetix.exchangeAtomically(
                sUSD,
                amount,
                sAUD,
                toBytes32('CODE12'),
                0,
                {
                    from: account1,
                }
            );

            const expectedPartnerFee = amount.div(toBN(50)); // Should be 2% of the exchange amount, per toUnit('0.02')
            const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE12'))
            assert.bnEqual(resp1.balance, expectedPartnerFee)
        });
    })

})