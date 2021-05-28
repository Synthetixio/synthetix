const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');

function itConfirmsOrders({ ctx }) {
    const sUSDAmount = ethers.utils.parseEther('100');

    let owner;

    let Synthetix, Exchanger, SynthsETH, FuturesMarketETH;

    before('target contracts and users', () => {
        ({ Synthetix, Exchanger, SynthsETH, FuturesMarketETH } = ctx.contracts);

        owner = ctx.owner;
    });

    before('ensure the owner has sUSD', async () => {
        await ensureBalance({ ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
    });

    describe('when a user submits an order', () => {
        const leverage = '1.0'
        let txReceipt

        before('submit the order', async () => {            
            const tx = FuturesMarketETH.connect(owner);
            const tx = await market.submitOrder(leverage, { from: account });
            txReceipt = await tx.wait()
            // const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
            // await tx.wait();
            // OrderConfirmed(uint256, address, uint256, int256, uint256, uint256)
            console.log(txReceipt)
        });

        it('is confirmed by the keeper within a second', async () => {
            await wait({ seconds: 1 })

            const events = await market.getPastEvents('OrderConfirmed', {
                filter: {
                    fromBlock: txReceipt.blockNumber
                }
            })
            
        });
    });
}

module.exports = {
    itConfirmsOrders,
};
