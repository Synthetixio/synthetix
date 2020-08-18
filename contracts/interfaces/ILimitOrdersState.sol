pragma solidity >=0.4.24;


interface ILimitOrdersState {
    // Structs
    struct LimitOrder {
        address submitter;
        bytes32 sourceCurrencyKey;
        uint sourceAmount;
        bytes32 destinationCurrencyKey;
        uint minDestinationAmount;
        uint executionFee;
    }

    // View functions
    function getLatestID() external view returns (uint);

    function getOrder(uint _orderID)
        external
        view
        returns (
            address submitter,
            bytes32 sourceCurrencyKey,
            uint sourceAmount,
            bytes32 destinationCurrencyKey,
            uint minDestinationAmount,
            uint executionFee
        );

    function getDepositAmount(address _address) external view returns (uint);

    // Mutative functions
    function addDeposit(address submitter, uint value) external;

    function removeDeposit(address submitter) external returns (uint);

    function storeOrder(
        address submitter,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint minDestinationAmount,
        uint executionFee
    ) external payable returns (uint orderID);

    function deleteOrder(uint orderID, address submitter) external;

    function deleteOrderAndRefund(
        uint orderID,
        address submitter,
        uint refundAmount
    ) external;
}
