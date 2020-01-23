pragma solidity 0.4.25;

import "./Owned.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";

contract EtherCollateral is Owned, Pausable  {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    
    // Public vars

    // The total number of synths issued by the collateral in this contract
    uint public totalIssuedSynths;

    // Public setter vars
    uint public interestRate = 0.005;

    // Minting fee for issuing the synths. Default 50 bips.
    uint public issueFeeRate = 5000;

    // If true then anyone can close a loan not just the loan creator. 
    bool public openLoanClosing = false;

    // Maximum amount of sETH that can be issued by the EtherCollateral contract. Default 5000
    uint public issueLimit = 5000;

    // The ratio of Collateral to synths issued
    uint public collateralizationRatio = SafeDecimalMath.unit() * 150;


    uint constant MAX_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() / 1000;
    uint constant MIN_COLLATERALIZATION_RATIO = SafeDecimalMath.unit() / 100;

    constructor(address _owner)
        Owned(_owner)
        public
    {}

    function setCollateralizationRatio(uint ratio)
        external
        onlyOwner
    {
        require(ratio < MAX_COLLATERALIZATION_RATIO, "Too high");
        require(ratio > MIN_COLLATERALIZATION_RATIO, "Too low");
        collateralizationRatio = ratio;
        emit CollateralizationRatioUpdated(ratio);
    }

    event CollateralizationRatioUpdated(uint ratio);
}
