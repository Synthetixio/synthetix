pragma solidity 0.4.25;


interface IExchanger {
    function exchange(address from, bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        external
        returns (bool);
}
