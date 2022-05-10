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

})