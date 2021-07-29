pragma solidity ^0.5.16;

contract TempOwned {
    address internal tempOwner;
    uint internal tempOwnerEOL;

    constructor(address _tempOwner, uint _tempOwnerEOL) public {
        tempOwner = _tempOwner;
        tempOwnerEOL = _tempOwnerEOL;
    }

    modifier onlyTemporaryOwner {
        _onlyTemporaryOwner();
        _;
    }

    function _onlyTemporaryOwner() private view {
        require(tempOwnerEOL >= now, "The EOL date for executing this function already reached");
        require(msg.sender == tempOwner, "Only the contract temporary owner may perform this action");
    }
}
