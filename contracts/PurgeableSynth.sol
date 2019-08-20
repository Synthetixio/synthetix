/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       PurgeableSynth.sol
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

import "./SafeDecimalMath.sol";
import "./ExchangeRates.sol";
import "./Synth.sol";


contract PurgeableSynth is Synth {

    using SafeDecimalMath for uint;

    // The maximum allowed amount of tokenSupply in equivalent sUSD value for this synth to permit purging
    uint public maxSupplyToPurgeInUSD = 100000 * SafeDecimalMath.unit(); // 100,000

    // Track exchange rates so we can determine if supply in USD is below threshpld at purge time
    ExchangeRates public exchangeRates;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, IFeePool _feePool,
        string _tokenName, string _tokenSymbol, address _owner, bytes32 _currencyKey, ExchangeRates _exchangeRates
    )
        Synth(_proxy, _tokenState, _synthetix, _feePool, _tokenName, _tokenSymbol, _owner, _currencyKey)
        public
    {
        exchangeRates = _exchangeRates;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Function that allows owner to exchange any number of holders back to sUSD (for frozen or deprecated synths)
     * @param addresses The list of holders to purge
     */
    function purge(address[] addresses)
        external
        optionalProxy_onlyOwner
    {
        uint maxSupplyToPurge = exchangeRates.effectiveValue("sUSD", maxSupplyToPurgeInUSD, currencyKey);

        // Only allow purge when total supply is lte the max or the rate is frozen in ExchangeRates
        require(
            totalSupply <= maxSupplyToPurge || exchangeRates.rateIsFrozen(currencyKey),
            "Cannot purge as total supply is above threshold and rate is not frozen."
        );

        for (uint8 i = 0; i < addresses.length; i++) {
            address holder = addresses[i];

            uint amountHeld = balanceOf(holder);

            if (amountHeld > 0) {
                synthetix.synthInitiatedExchange(holder, currencyKey, amountHeld, "sUSD", holder);
                emitPurged(holder, amountHeld);
            }

        }

    }

    /* ========== SETTERS ========== */

    function setExchangeRates(ExchangeRates _exchangeRates)
        external
        optionalProxy_onlyOwner
    {
        exchangeRates = _exchangeRates;
    }

    /* ========== EVENTS ========== */

    event Purged(address indexed account, uint value);
    bytes32 constant PURGED_SIG = keccak256("Purged(address,uint256)");
    function emitPurged(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, PURGED_SIG, bytes32(account), 0, 0);
    }
}
