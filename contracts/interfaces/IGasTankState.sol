pragma solidity >=0.4.24;


interface IGasTankState {
    function balanceOf(address _account) external view returns (uint);

    function maxGasPriceOf(address _account) external view returns (uint);
}
