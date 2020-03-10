pragma solidity 0.4.25;


contract SynthetixEscrow {
    function numVestingEntries(address account) public returns (uint);

    function getVestingScheduleEntry(address account, uint index) public returns (uint[2]);
}


// https://docs.synthetix.io/contracts/EscrowChecker
contract EscrowChecker {
    SynthetixEscrow public synthetix_escrow;

    constructor(SynthetixEscrow _esc) public {
        synthetix_escrow = _esc;
    }

    function checkAccountSchedule(address account) public view returns (uint[16]) {
        uint[16] memory _result;
        uint schedules = synthetix_escrow.numVestingEntries(account);
        for (uint i = 0; i < schedules; i++) {
            uint[2] memory pair = synthetix_escrow.getVestingScheduleEntry(account, i);
            _result[i * 2] = pair[0];
            _result[i * 2 + 1] = pair[1];
        }
        return _result;
    }
}
