/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       IndexSynth.sol
version:    1.0
author:     Justin J. Moses
date:       2019-05-22

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Purgeable synths are a subclass of Synth that allows the owner
to exchange all holders of the Synth back into sUSD.

In order to reduce gas load on the system, and to repurpose older synths
no longer used, purge allows the owner to purge all holders balances into sUSD

-----------------------------------------------------------------
*/


pragma solidity 0.4.25;

import "./PurgeableSynth.sol";

contract IndexSynth is PurgeableSynth {

    // The maximum allowed amount of tokenSupply in equivalent sUSD value for this synth to permit purging
    uint public maxSupplyToPurgeInUSD = 100000 * SafeDecimalMath.unit(); // 100,000

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, IFeePool _feePool,
        string _tokenName, string _tokenSymbol, address _owner, bytes4 _currencyKey, ExchangeRates _exchangeRates
    )
        PurgeableSynth(_proxy, _tokenState, _synthetix, _feePool, _tokenName, _tokenSymbol, _owner, _currencyKey, _exchangeRates)
        public
    {}


}
