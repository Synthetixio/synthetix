const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { toUnit } = require('../../utils')();
const { wait } = require('../utils/rpc');
const { utils: { parseEther } } = ethers

function itConfirmsOrders({ ctx }) {
    const sUSDAmount = ethers.utils.parseEther('200');
    const leverage = parseEther('0.001')

    let owner;

    let Synthetix, Exchanger, SynthsETH, FuturesMarketETH, Market;

    before('target contracts and users', () => {
        ({ Synthetix, Exchanger, SynthsETH, FuturesMarketETH } = ctx.contracts);

        owner = ctx.owner;
    });

    before('ensure the owner has sUSD', async () => {
        await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
    });

    describe.only('when a user submits an order', () => {
        let txReceipt

        before('submit the order', async () => {
            Synthetix = Synthetix.connect(owner);
            FuturesMarketETH = FuturesMarketETH.connect(owner);
            // const market = FuturesMarketETH.connect(owner);

            const tx = await FuturesMarketETH.submitOrder(leverage, { from: owner.address });
            txReceipt = await tx.wait()

            // const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
            // await tx.wait();
            // OrderConfirmed(uint256, address, uint256, int256, uint256, uint256)
            console.log(txReceipt)
        });

        it('is confirmed by the keeper within a second', async () => {
            await wait({ seconds: 1 })

            const events = await FuturesMarketETH.getPastEvents('OrderConfirmed', {
                filter: {
                    fromBlock: txReceipt.blockNumber
                }
            })
            assert.isAtLeast(events.length, 1);
            const event = events.find(log => log.event === 'OrderConfirmed');
            console.log(events)
        });
    });
}

module.exports = {
    itConfirmsOrders,
};
