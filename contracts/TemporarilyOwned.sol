pragma solidity ^0.5.16;

contract TemporarilyOwned {
    address public temporaryOwner;
    address public nominatedOwner;
    uint public expiryTime;

    constructor(address _temporaryOwner, uint _ownershipDuration) public {
        require(_temporaryOwner != address(0), "Temp owner address cannot be 0");
        require(_ownershipDuration > 0, "Duration cannot be 0");

        temporaryOwner = _temporaryOwner;
        expiryTime = block.timestamp + _ownershipDuration;
    }

    function setNewExpiryTime(uint _duration) external onlyTemporaryOwner {
        require(_duration > 0, "Duration cannot be 0");
        require(block.timestamp + _duration < expiryTime, "New expiry time must be sooner than it currently is");
        expiryTime = block.timestamp + _duration;
    }

    function nominateNewOwner(address _owner) external onlyTemporaryOwner {
        nominatedOwner = _owner;
        emit OwnerNominated(_owner);
    }

    function acceptOwnership() external {
        require(block.timestamp < expiryTime, "Ownership expired");
        require(msg.sender == nominatedOwner, "You must be nominated before you can accept ownership");
        emit OwnerChanged(temporaryOwner, nominatedOwner);
        temporaryOwner = nominatedOwner;
        nominatedOwner = address(0);
    }

    modifier onlyTemporaryOwner {
        _onlyTemporaryOwner();
        _;
    }

    function _onlyTemporaryOwner() private view {
        require(block.timestamp < expiryTime, "Ownership expired");
        require(msg.sender == temporaryOwner, "Only executable by temp owner");
    }

    event OwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);
}
