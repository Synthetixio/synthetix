pragma solidity ^0.5.16;


interface IEtherCollateral {
    function totalIssuedSynths() external view returns (uint256);
}
