pragma solidity ^0.5.16;


interface AggregatorInterface {
    function latestAnswer() external view returns (int256);

    function latestTimestamp() external view returns (uint256);

    function latestRound() external view returns (uint256);

    function getAnswer(uint256 roundId) external view returns (int256);

    function getTimestamp(uint256 roundId) external view returns (uint256);
}


contract MockAggregator is AggregatorInterface {
    uint public roundId = 0;

    struct Entry {
        int256 answer;
        uint256 timestamp;
    }

    mapping(uint => Entry) public entries;

    constructor() public {}

    // Mock setup function
    function setLatestAnswer(int256 answer, uint256 timestamp) external {
        roundId++;
        entries[roundId] = Entry({answer: answer, timestamp: timestamp});
    }

    function setLatestAnswerWithRound(
        int256 answer,
        uint256 timestamp,
        uint256 _roundId
    ) external {
        roundId = _roundId;
        entries[roundId] = Entry({answer: answer, timestamp: timestamp});
    }

    function latestAnswer() external view returns (int256) {
        return getAnswer(latestRound());
    }

    function latestTimestamp() external view returns (uint256) {
        return getTimestamp(latestRound());
    }

    function latestRound() public view returns (uint256) {
        return roundId;
    }

    function getAnswer(uint256 _roundId) public view returns (int256) {
        return entries[_roundId].answer;
    }

    function getTimestamp(uint256 _roundId) public view returns (uint256) {
        return entries[_roundId].timestamp;
    }
}
