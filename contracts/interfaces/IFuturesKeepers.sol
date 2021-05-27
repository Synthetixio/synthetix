pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/IFuturesKeepers
interface IFuturesKeepers {
    function requestConfirmationKeeper(address market, address account) external;

    function cancelConfirmationKeeper(address market, address account) external;

    function requestLiquidationKeeper(address market, address account) external;

    function cancelLiquidationKeeper(address market, address account) external;
}
