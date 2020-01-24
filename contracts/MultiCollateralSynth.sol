/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       MultiCollateralSynth.sol

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
import "./EtherCollateral.sol";
import "./Synth.sol";
import "./interfaces/ISynthetix.sol";


contract MultiCollateralSynth is Synth {

    using SafeDecimalMath for uint;

    // EtherCollateral contract able to issue and burn synth
    EtherCollateral public etherCollateral;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, address _synthetixProxy, IFeePool _feePool,
        string _tokenName, string _tokenSymbol, address _owner, bytes32 _currencyKey, ExchangeRates _exchangeRates, uint _totalSupply, EtherCollateral _etherCollateral
    )
        Synth(_proxy, _tokenState, _synthetixProxy, _feePool, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply)
        public
    {
        etherCollateral = _etherCollateral;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Function that allows owner to exchange any number of holders back to sUSD (for frozen or deprecated synths)
     * @param addresses The list of holders to purge
     */
    function issue(address account, uint amount)
        external
        onlyEtherCollateral
    {
    }

    /* ========== MODIFIERS ========== */

    modifier onlyEtherCollateral() {
        bool isSynthetix = msg.sender == address(Proxy(synthetixProxy).target());
        bool isFeePool = msg.sender == address(Proxy(feePoolProxy).target());

        require(isSynthetix || isFeePool, "Only Synthetix, FeePool allowed");
        _;
    }

    /* ========== EVENTS ========== */

}
