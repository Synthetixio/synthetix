pragma solidity 0.4.25;


interface IExchanger {
    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint);

    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) public view returns (uint);

    function settlementOwing(address account, bytes32 currencyKey) public view returns (uint, uint);

    function settle(address from, bytes32 currencyKey) external returns (uint, uint);

    function exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    ) external returns (uint amountReceived);
}
