pragma solidity ^0.5.16;

// Stub functions required by the DebtCache and FeePool contracts.
// https://docs.synthetix.io/contracts/source/contracts/etherwrapper
contract EmptyEtherWrapper {
    constructor() public {}

    /* ========== VIEWS ========== */

    function totalIssuedSynths() public view returns (uint) {
        return 0;
    }

    function distributeFees() external {}
}
