pragma solidity 0.4.25;


/**
 * @title Synthetix Depot interface
 */
contract IDepot {
    function exchangeEtherForSynths() public payable returns (uint);

    function exchangeEtherForSynthsAtRate(uint guaranteedRate) external payable returns (uint);

    function depositSynths(uint amount) external;

    function withdrawMyDepositedSynths() external;

    // Deprecated ABI for MAINNET. Only used on Testnets
    function exchangeEtherForSNX() external payable returns (uint);

    function exchangeEtherForSNXAtRate(uint guaranteedRate) external payable returns (uint);

    function exchangeSynthsForSNX() external payable returns (uint);
}
