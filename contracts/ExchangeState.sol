
pragma solidity 0.4.25;

import "./State.sol";

contract ExchangeState is State {

    struct ExchangeEntry {
        bytes32 src;
        uint amount;
        bytes32 dest;
        uint amountReceived;
        uint timestamp;
        uint roundIdForSrc; // for Chainlink
        uint roundIdForDest; // for Chainlink
    }

    mapping(address => mapping(bytes32 => ExchangeEntry [])) public exchanges;

    uint public maxEntriesInQueue = 12;

    function setMaxEntriesInQueue(uint _maxEntriesInQueue) external onlyOwner {
        maxEntriesInQueue = _maxEntriesInQueue;
    }

    constructor(address _owner, address _associatedContract)
        State(_owner, _associatedContract)
        public
    {}

    function appendExchangeEntry(address account, bytes32 src, uint amount, bytes32 dest, uint amountReceived, uint timestamp, uint roundIdForSrc, uint roundIdForDest)
        external onlyAssociatedContract
    {
        require(exchanges[account][dest].length < maxEntriesInQueue, "Cannot insert more items into the queue, max length reached.");

        exchanges[account][dest].push(
            ExchangeEntry(
                {
                    src: src,
                    amount: amount,
                    dest: dest,
                    amountReceived: amountReceived,
                    timestamp: timestamp,
                    roundIdForSrc: roundIdForSrc,
                    roundIdForDest: roundIdForDest
                }
        ));
    }

    function getLengthOfEntries(address account, bytes32 currencyKey) external view returns (uint) {
        return exchanges[account][currencyKey].length;
    }

    function getEntryAt(address account, bytes32 currencyKey, uint index) external view returns (bytes32, uint, bytes32, uint, uint, uint, uint) {
        ExchangeEntry storage entry = exchanges[account][currencyKey][index];
        return (entry.src, entry.amount, entry.dest, entry.amountReceived, entry.timestamp, entry.roundIdForSrc, entry.roundIdForDest);
    }

    function removeEntries(address account, bytes32 currencyKey) external onlyAssociatedContract {
        delete exchanges[account][currencyKey];
    }

    function getMaxTimestamp(address account, bytes32 currencyKey) external view returns (uint) {
        ExchangeEntry[] storage userEntries = exchanges[account][currencyKey];
        uint timestamp = 0;
        for (uint i = 0; i < userEntries.length; i++) {
            if (userEntries[i].timestamp > timestamp) {
                timestamp = userEntries[i].timestamp;
            }
        }
        return timestamp;
    }
}
