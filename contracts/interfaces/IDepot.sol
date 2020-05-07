pragma solidity ^0.5.16;


interface IDepot {
    function exchangeEtherForSynths() external payable returns (uint);

    function exchangeEtherForSynthsAtRate(uint guaranteedRate) external payable returns (uint);

    function depositSynths(uint amount) external;

    function withdrawMyDepositedSynths() external;

    // Deprecated ABI for MAINNET. Only used on Testnets
    function exchangeEtherForSNX() external payable returns (uint);

    function exchangeEtherForSNXAtRate(uint guaranteedRate, uint guaranteedSynthetixRate) external payable returns (uint);

    function exchangeSynthsForSNX(uint synthAmount) external returns (uint);

    function exchangeSynthsForSNXAtRate(uint synthAmount, uint guaranteedRate) external returns (uint);
}
