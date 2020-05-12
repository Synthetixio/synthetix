'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit } = require('../utils')();

const BinaryOptionMarketFactory = artifacts.require('BinaryOptionMarketFactory');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarketFactory', accounts => {
    const [initialCreator] = accounts;

    const initialPoolFee = toUnit(0.008);
    const initialCreatorFee = toUnit(0.002);
    const initialRefundFee = toUnit(0.02)

    let factory;

    const deployFactory = async ({creator, poolFee, creatorFee, refundFee}) => {
        return await BinaryOptionMarketFactory.new(creator, poolFee, creatorFee, refundFee);
    }

    const setupNewFactory = async () => {
        factory = await deployFactory({
            creator: initialCreator,
            poolFee: initialPoolFee,
            creatorFee: initialCreatorFee,
            refundFee: initialRefundFee,
        });
    }

    before(async () => {
        BinaryOptionMarketFactory.link(await SafeDecimalMath.new());
        await setupNewFactory();
    });

    addSnapshotBeforeRestoreAfterEach();

    describe('Basic parameters', () => {
        it('static parameters are set properly', async () => {
            assert.bnEqual(await factory.poolFee(), initialPoolFee);
            assert.bnEqual(await factory.creatorFee(), initialCreatorFee);
            assert.bnEqual(await factory.refundFee(), initialRefundFee);
        });

        it('Set pool fee', async () => {
            const newFee = toUnit(0.5);
            await factory.setPoolFee(newFee);
            assert.bnEqual(await factory.poolFee(), newFee);
        });

        it("Pool fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setPoolFee(newFee), "Total fee must be less than 100%.");
        });

        it('Set creator fee', async () => {
            const newFee = toUnit(0.5);
            await factory.setCreatorFee(newFee);
            assert.bnEqual(await factory.creatorFee(), newFee);
        });

        it("Creator fee can't be set too high", async () => {
            const newFee = toUnit(1);
            await assert.revert(factory.setCreatorFee(newFee), "Total fee must be less than 100%.");
        });

        it('Set refund fee', async () => {
            const newFee = toUnit(1);
            await factory.setRefundFee(newFee);
            assert.bnEqual(await factory.refundFee(), newFee);
        });

        it("Refund fee can't be set too high", async () => {
            const newFee = toUnit(1.01);
            await assert.revert(factory.setRefundFee(newFee), "Refund fee must be no greater than 100%.");
        });
    });

});