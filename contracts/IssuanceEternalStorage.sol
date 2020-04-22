pragma solidity ^0.5.16;

import "./EternalStorage.sol";


// TODO: this contract is redundant and should be removed

// https://docs.synthetix.io/contracts/IssuanceEternalStorage
contract IssuanceEternalStorage is EternalStorage {
    constructor(address _owner, address _issuer) public EternalStorage(_owner, _issuer) {}
}
