const { contract } = require('hardhat');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toBytes32, constants: { ZERO_ADDRESS } } = require('../..');
const { toUnit } = require('../utils')();

contract('VolumePartner', accounts => {
    const [deployerAccount, owner, relayer, account1, account2] = accounts;
    let volumePartner, systemSettings;

    beforeEach(async () => {
        ({ SystemSettings: systemSettings, VolumePartner: volumePartner } = await setupAllContracts({
            accounts,
            synths: ['sUSD', 'sAUD'],
            contracts: ['FuturesMarketManager', 'Exchanger', 'Issuer', 'VolumePartner']
        }));
        await systemSettings.setMaxVolumePartnerFee(toUnit('0.1'), {
            from: owner,
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
        beforeEach(async () => {
            await volumePartner.registerVolumePartnerCode(toBytes32('CODE6'), account1, toUnit('0.1'));
        });

        it('Can update when the owner', async () => {
            const resp1 = await volumePartner.getFeeRate(toBytes32('CODE6'))
            assert.bnEqual(resp1, toUnit('0.1'));

            const transaction = await volumePartner.updateFeeRate(toBytes32('CODE6'), toUnit('0.01'), { from: account1 });
            assert.eventEqual(transaction, 'FeeRateUpdated', { volumePartnerCode: toBytes32('CODE6'), caller: account1, feeRate: toUnit('0.01') });

            const resp2 = await volumePartner.getFeeRate(toBytes32('CODE6'))
            assert.bnEqual(resp2, toUnit('0.01'));
        })

        it('Cannot update when greater than the max', async () => {
            const resp1 = await volumePartner.getFeeRate(toBytes32('CODE6'))
            assert.bnEqual(resp1, toUnit('0.1'));

            await assert.revert(
                volumePartner.updateFeeRate(toBytes32('CODE6'), toUnit('0.2'), { from: account1 }),
                'Fee rate must be less than or equal to the maximum.'
            );
        })

        it('Cannot update when not the owner', async () => {
            const resp1 = await volumePartner.getFeeRate(toBytes32('CODE6'))
            assert.bnEqual(resp1, toUnit('0.1'));

            await assert.revert(
                volumePartner.updateFeeRate(toBytes32('CODE6'), toUnit('0.01'), { from: account2 }),
                'You are not the owner of this volume partner code'
            );
        })
    });

    it('Can transfer ownership of a volume partner code', async () => {
        await volumePartner.registerVolumePartnerCode(toBytes32('CODE7'), account1, toUnit('0.01'));
        const resp1 = await volumePartner.volumePartnerData(toBytes32('CODE7'))
        assert.bnEqual(resp1.nominatedOwner, ZERO_ADDRESS);

        await assert.revert(
            volumePartner.nominateOwner(toBytes32('CODE7'), account2),
            'You are not the owner of this volume partner code'
        );

        const transaction1 = await volumePartner.nominateOwner(toBytes32('CODE7'), account2, { from: account1 });
        assert.eventEqual(transaction1, 'OwnerNominated', { volumePartnerCode: toBytes32('CODE7'), nominee: account2 });

        const resp2 = await volumePartner.volumePartnerData(toBytes32('CODE7'))

        assert.bnEqual(resp2.nominatedOwner, account2);

        await assert.revert(
            volumePartner.acceptOwnership(toBytes32('CODE7'), { from: account1 }),
            'You are not the nominated owner of this volume partner code'
        );

        const transaction2 = await volumePartner.acceptOwnership(toBytes32('CODE7'), { from: account2 });
        assert.eventEqual(transaction2, 'OwnershipAccepted', { volumePartnerCode: toBytes32('CODE7'), previousOwner: account1, newOwner: account2 });

        const resp3 = await volumePartner.volumePartnerData(toBytes32('CODE7'))
        assert.bnEqual(resp3.owner, account2);
        assert.bnEqual(resp3.nominatedOwner, ZERO_ADDRESS);
    })

})
