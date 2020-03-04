pragma solidity 0.4.25;


interface IDelegateApprovals {
    function rateForCurrency(bytes32 currencyKey) external view returns (uint);

    function canBurnFor(address owner, address delegate) external view returns (bool);

    function canIssueFor(address owner, address delegate) external view returns (bool);

    function canClaimFor(address owner, address delegate) external view returns (bool);

    function canExchangeFor(address owner, address delegate) external view returns (bool);
}
