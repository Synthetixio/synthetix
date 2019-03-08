pragma solidity 0.4.25;

/**
 * @title SynthetixEscrow interface
 */
interface ISynthetixEscrow {
    function balanceOf(bytes4 currencyKey) external view returns (bool);
}