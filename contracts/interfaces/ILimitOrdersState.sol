pragma solidity >=0.4.24;


interface ILimitOrdersState {
    // Structs
    struct LimitOrder {
        address submitter;
        bytes32 sourceCurrencyKey;
        uint256 sourceAmount;
        bytes32 destinationCurrencyKey;
        uint256 minDestinationAmount;
        uint256 weiDeposit;
        uint256 executionFee;
    }

    // Mutative functions
    function storeOrder(
        address submitter,
        bytes32 sourceCurrencyKey,
        uint256 sourceAmount,
        bytes32 destinationCurrencyKey,
        uint256 minDestinationAmount,
        uint256 weiDeposit,
        uint256 executionFee
    ) external payable returns (uint orderID);

    function deleteOrder(uint256 orderID, address submitter) external returns (uint);

    // View functions
    function getLatestID() external view returns (uint);

    function getOrder(uint _orderID)
        external
        view
        returns (
            address,
            bytes32,
            uint256,
            bytes32,
            uint256,
            uint256,
            uint256
        );
}
