pragma solidity ^0.5.16;

import "./EternalStorage.sol";


contract IssuanceEternalStorage is EternalStorage {

    /**
     * @dev Constructor.
     * @param _owner The owner of this contract.
     * @param _issuer The associated contract.
     */
    constructor(address _owner, address _issuer) public EternalStorage(_owner, _issuer) {}
}
