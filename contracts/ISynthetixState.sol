pragma solidity 0.4.25;

interface ISynthetixState {
    function getPreferredCurrency(address to) public view returns(bytes4);
    function debtLedgerLength() external view returns (uint);
    function getDebtLedgerAt(uint index) public view returns (uint);
    function hasIssued(address account) external view returns (bool);
    function incrementTotalIssuerCount() external;
    function decrementTotalIssuerCount() external;
    function setCurrentIssuanceData(address account, uint initialDebtOwnership) external;
    function lastDebtLedgerEntry() external view returns (uint);
    function appendDebtLedgerValue(uint value) external;
    function getIssuanceData(address from) public view returns (uint, uint);
    function clearIssuanceData(address account) external;
    function getIssuanceRatio() public view returns (uint);
}
