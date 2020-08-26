pragma solidity >=0.4.24;


interface IGasTankState {
    function balanceOf(address _account) external view returns (uint);

    function maxGasPriceOf(address _account) external view returns (uint);

    function setMaxGasPrice(address _account, uint _gasPrice) external;

    function addDeposit(address _depositor, uint _amount) external;

    function subtractFromDeposit(address _depositor, uint _amount) external;
}
