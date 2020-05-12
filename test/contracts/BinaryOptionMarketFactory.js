'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert } = require('./common');
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

    describe.only('Basic parameters', () => {
        it('static parameters are set properly', async () => {
            assert.bnEqual(await factory.poolFee(), initialPoolFee);
            assert.bnEqual(await factory.creatorFee(), initialCreatorFee);
            assert.bnEqual(await factory.refundFee(), initialRefundFee);
        });
    });

});