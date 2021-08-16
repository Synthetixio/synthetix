pragma solidity ^0.5.16;


contract TempOwned {
    address internal tempOwner;
    uint internal tempOwnerEOL;

    constructor(address _tempOwner, uint _tempOwnerEOL) public {
        require(_tempOwner != address(0), "Owner address cannot be 0");
        require(_tempOwnerEOL > now, "Onvalid temp owner EOL");

        tempOwner = _tempOwner;
        tempOwnerEOL = _tempOwnerEOL;
    }

    modifier onlyTemporaryOwner {
        _onlyTemporaryOwner();
        _;
    }

    function _onlyTemporaryOwner() private view {
        require(now <= tempOwnerEOL, "Owner EOL date already reached");
        require(msg.sender == tempOwner, "Only executable by temp owner");
    }
}
