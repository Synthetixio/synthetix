pragma solidity ^0.8.9;

// Inheritance
import "./EternalStorage.sol";
import "./LimitedSetup.sol";

// https://docs.synthetix.io/contracts/source/contracts/feepooleternalstorage
contract FeePoolEternalStorage is EternalStorage, LimitedSetup {
    bytes32 internal constant LAST_FEE_WITHDRAWAL = "last_fee_withdrawal";

    constructor(address _owner, address _feePool) EternalStorage(_owner, _feePool) LimitedSetup(6 weeks) {}

    function importFeeWithdrawalData(address[] calldata accounts, uint[] calldata feePeriodIDs)
        external
        onlyOwner
        onlyDuringSetup
    {
        require(accounts.length == feePeriodIDs.length, "Length mismatch");

        for (uint8 i = 0; i < accounts.length; i++) {
            this.setUIntValue(keccak256(abi.encodePacked(LAST_FEE_WITHDRAWAL, accounts[i])), feePeriodIDs[i]);
        }
    }
}
