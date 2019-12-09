
pragma solidity 0.4.25;

interface AggregatorInterface {
    function latestAnswer() external view returns (int256);
    function latestTimestamp() external view returns (uint256);
    // function latestRound() external view returns (uint256);
    // function getAnswer(uint256 roundId) external view returns (int256);
    // function getTimestamp(uint256 roundId) external view returns (uint256);

    // event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 timestamp);
    // event NewRound(uint256 indexed roundId, address indexed startedBy);
}

contract MockAggregator is AggregatorInterface {

    int256 private _latestAnswer;
    uint256 private _latestTimestamp;

    constructor () public { }

    // Mock setup function
    function setLatestAnswer(int256 answer) external {
        _latestAnswer = answer;
        _latestTimestamp = now;
    }

    function latestAnswer() external view returns (int256) {
        return _latestAnswer;
    }

    function latestTimestamp() external view returns (uint256) {
        return _latestTimestamp;
    }
}
