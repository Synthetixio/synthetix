pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/iexchangestate
interface IExchangeState {
    // Views
    struct ExchangeEntry {
        bytes32 src;
        uint amount;
        bytes32 dest;
        uint amountReceived;
        uint exchangeFeeRate;
        uint timestamp;
        uint roundIdForSrc;
        uint roundIdForDest;
    }

    function getLengthOfEntries(address account, bytes32 currencyKey) external view returns (uint);

    function getEntryAt(
        address account,
        bytes32 currencyKey,
        uint index
    )
        external
        view
        returns (
            bytes32 src,
            uint amount,
            bytes32 dest,
            uint amountReceived,
            uint exchangeFeeRate,
            uint timestamp,
            uint roundIdForSrc,
            uint roundIdForDest
        );

    function getMaxTimestamp(address account, bytes32 currencyKey) external view returns (uint);

    // Mutative functions
    function appendExchangeEntry(
        address account,
        bytes32 src,
        uint amount,
        bytes32 dest,
        uint amountReceived,
        uint exchangeFeeRate,
        uint timestamp,
        uint roundIdForSrc,
        uint roundIdForDest
    ) external;

    function removeEntries(address account, bytes32 currencyKey) external;
}
