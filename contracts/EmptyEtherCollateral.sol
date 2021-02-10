pragma solidity ^0.5.16;


// Empty contract for ether collateral placeholder for OVM
// https://docs.synthetix.io/contracts/source/contracts/emptyethercollateral
contract EmptyEtherCollateral {
    function totalIssuedSynths() external pure returns (uint) {
        return 0;
    }
}
