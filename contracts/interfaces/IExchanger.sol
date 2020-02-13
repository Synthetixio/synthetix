pragma solidity 0.4.25;


interface IExchanger {
    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint);

    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) public view returns (uint);

    function settlementOwing(address account, bytes32 currencyKey)
        public
        view
        returns (uint reclaimAmount, uint rebateAmount);

    function settle(address from, bytes32 currencyKey) external returns (uint reclaimed, uint refunded);

    function exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress
    ) external returns (uint amountReceived);

    function calculateAmountAfterSettlement(address from, bytes32 currencyKey, uint amount, uint refunded)
        public
        view
        returns (uint amountAfterSettlement);
}
