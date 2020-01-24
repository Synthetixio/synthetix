/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       MultiCollateralSynth.sol

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

MultiCollateralSynth synths are a subclass of Synth that allows the EtherCollateral
contract to issue and burn synths.

-----------------------------------------------------------------
*/


pragma solidity 0.4.25;

import "./SafeDecimalMath.sol";
import "./EtherCollateral.sol";
import "./Synth.sol";
import "./interfaces/ISynthetix.sol";


contract MultiCollateralSynth is Synth {

    // EtherCollateral contract able to issue and burn synth
    EtherCollateral public etherCollateral;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _proxy, TokenState _tokenState, address _synthetixProxy, IFeePool _feePool,
        string _tokenName, string _tokenSymbol, address _owner, bytes32 _currencyKey, uint _totalSupply, EtherCollateral _etherCollateral
    )
        Synth(_proxy, _tokenState, _synthetixProxy, _feePool, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply)
        public
    {
        etherCollateral = _etherCollateral;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Function that allows Ether Collateral to issue a certain number of synths from an account.
     * @param account Account to issue synths to
     * @param amount Number of synths
     */
    function issueToken(address account, uint amount)
        external
        onlyEtherCollateral
    {
        super._internalIssue(account, amount);
    }
    
    /**
     * @notice Function that allows Ether Collateral to burn a certain number of synths from an account.
     * @param account Account to burn synths from
     * @param amount Number of synths
     */
    function burnToken(address account, uint amount)
        external
        onlyEtherCollateral
    {
        super._internalBurn(account, amount);
    }
    
    /* ========== SETTERS ========== */

    function setEtherCollateral(EtherCollateral _etherCollateral)
        external
        optionalProxy_onlyOwner
    {
        exchangeRates = _exchangeRates;
    }


    /* ========== MODIFIERS ========== */

    modifier onlyEtherCollateral() {
        require(msg.sender == etherCollateral, "Only EtherCollateral allowed");
        _;
    }

    /* ========== EVENTS ========== */
    event EthCollateralIssued(address indexed account, uint value);
    bytes32 constant ETHCOLLATERALISSUED_SIG = keccak256("EthCollateralIssued(address,uint256)");
    function emitEthCollateralIssued(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, ETHCOLLATERALISSUED_SIG, bytes32(account), 0, 0);
    }

    event EthCollateralBurned(address indexed account, uint value);
    bytes32 constant ETHCOLLATERALBURNED_SIG = keccak256("EthCollateralBurned(address,uint256)");
    function emitEthCollateralBurned(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, ETHCOLLATERALBURNED_SIG, bytes32(account), 0, 0);
    }
}
