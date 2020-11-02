pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/IGasTank
interface IGasTank {
    function keeperFee() external view returns (uint fee);

    function balanceOf(address _account) external view returns (uint balance);

    function maxGasPriceOf(address _account) external view returns (uint maxGasPriceWei);

    function currentGasPrice() external view returns (uint currentGasPriceWei);

    function currentEtherPrice() external view returns (uint currentGasPriceWei);

    function executionCost(uint _gas) external view returns (uint etherCost);

    function approveContract(bytes32 _contractName, bool _approve) external;

    function depositEtherOnBehalf(address _account) external payable;

    function depositEther() external payable;

    function withdrawEtherOnBehalf(
        address _account,
        address payable _recipient,
        uint _amount
    ) external payable;

    function withdrawEther(uint _amount) external payable;

    function setMaxGasPriceOnBehalf(address _account, uint _maxGasPriceWei) external;

    function setMaxGasPrice(uint _maxGasPriceWei) external;

    function payGas(
        address _spender,
        address payable _recipient,
        uint _gas
    ) external returns (uint);
}
