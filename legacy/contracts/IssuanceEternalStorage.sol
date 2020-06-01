pragma solidity 0.4.25;

import "./EternalStorage.sol";


// https://docs.synthetix.io/contracts/IssuanceEternalStorage
contract IssuanceEternalStorage is EternalStorage {
    /**
     * @dev Constructor.
     * @param _owner The owner of this contract.
     * @param _issuer The associated contract.
     */
    constructor(address _owner, address _issuer) public EternalStorage(_owner, _issuer) {}
}
