pragma solidity 0.4.25;


/**
 * @title Synthetix Depot interface
 */
contract IDepot {

    function exchangeEtherForSynths() public payable returns (uint);

    function exchangeEtherForSynthsAtRate(uint guaranteedRate) external payable returns (uint);

    function depositSynths(uint amount) external;

    function withdrawMyDepositedSynths() external;

    function synthsReceivedForEther(uint amount) public view returns (uint);

    // Deprecated ABI for MAINNET. Only used on Testnets
    function exchangeEtherForSNX() external payable returns (uint);

    function exchangeEtherForSNXAtRate(uint guaranteedRate) external payable returns (uint);

    function exchangeSynthsForSNX() external payable returns (uint);    

    function synthetixReceivedForEther(uint amount) public view returns (uint);

    function synthetixReceivedForSynths(uint amount) public view returns (uint);

    function withdrawSynthetix(uint amount) external;
}
