pragma solidity ^0.5.16;

contract TemporarilyOwned {
    address public tempOwner;
    uint public initialTimestamp;
    uint public duration;

    constructor(address _tempOwner, uint _duration) public {
        require(_tempOwner != address(0), "Owner address cannot be 0");

        tempOwner = _tempOwner;
        initialTimestamp = now;
        duration = _duration;
    }

    modifier onlyTemporaryOwner {
        _onlyTemporaryOwner();
        _;
    }

    function _onlyTemporaryOwner() private view {
        require(now - initialTimestamp < duration, "Ownership expired");
        require(msg.sender == tempOwner, "Only executable by temp owner");
    }
}
