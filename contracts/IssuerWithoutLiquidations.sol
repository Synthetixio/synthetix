pragma solidity ^0.5.16;

// Internal references
import "./Issuer.sol";


// https://docs.synthetix.io/contracts/source/contracts/issuerwithoutliquidations
contract IssuerWithoutLiquidations is Issuer {
    constructor(address _owner, address _resolver) public Issuer(_owner, _resolver) {}

    function liquidateDelinquentAccount(
        address account,
        uint susdAmount,
        address liquidator
    ) external onlySynthetix returns (uint totalRedeemed, uint amountToLiquidate) {}
}
