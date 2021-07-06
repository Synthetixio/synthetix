'use strict';

const { gray } = require('chalk');
const {
    utils: { isAddress },
} = require('ethers');
const { toBytes32 } = require('../../../..');
const w3utils = require('web3-utils');

module.exports = async ({ deployer, runStep }) => {
    console.log(gray(`\n------ CONFIGURE FUTURES ------\n`));

    const futuresMarketSettings = deployer.deployedContracts[`FuturesMarketSettings`];
    const futuresAssets = await getDeployParameter('FUTURES_ASSETS');

    for (const asset of futuresAssets) {
        console.log(gray(`\n   --- MARKET ${asset} ---\n`));

        const baseAsset = toBytes32(`s${currencyKey}`);

        // const tokenStateForSynth = deployer.deployedContracts[`TokenState${currencyKey}`];
        // const proxyForSynth = deployer.deployedContracts[`Proxy${currencyKey}`];
        // const proxyERC20ForSynth =
        //     currencyKey === 'sUSD' ? deployer.deployedContracts[`ProxyERC20sUSD`] : undefined;

        // if (tokenStateForSynth && synth) {
        //     await runStep({
        //         contract: `TokenState${currencyKey}`,
        //         target: tokenStateForSynth,
        //         read: 'associatedContract',
        //         expected: input => input === addressOf(synth),
        //         write: 'setAssociatedContract',
        //         writeArg: addressOf(synth),
        //         comment: `Ensure the ${currencyKey} synth can write to its TokenState`,
        //     });
        // }

        // TODO: Perform this programmatically per-market
        const settings = {
            takerFee: w3utils.toWei('0.003'),
            makerFee: w3utils.toWei('0.001'),
            maxLeverage: w3utils.toWei('10'),
            maxMarketValue: w3utils.toWei('100000'),
            maxFundingRate: w3utils.toWei('0.1'),
            maxFundingRateSkew: w3utils.toWei('1'),
            maxFundingRateDelta: w3utils.toWei('0.0125'),
        };

        for (const setting in settings) {
            const capSetting = setting.charAt(0).toUpperCase() + setting.slice(1);
            const value = settings[setting];
            await runStep({
                contract: 'FuturesMarketSettings',
                target: futuresMarketSettings,
                read: `get${capSetting}`,
                readArg: [baseAsset],
                expected: input => input === value,
                write: `set${capSetting}`,
                writeArg: [baseAsset, value],
            });
        }
    }
};
