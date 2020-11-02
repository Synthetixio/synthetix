pragma solidity ^0.5.16;

import "../MixinResolver.sol";
import "../Owned.sol";

import "../interfaces/ISynthetix.sol";
import "../interfaces/IGasTank.sol";

// Contract used to test the GasTank "payGas" function
contract Keeper is Owned, MixinResolver {
    bytes32 public constant CONTRACT_GASTANK = "GasTank";
    bytes32 public constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32[24] internal addressesToCache = [CONTRACT_GASTANK, CONTRACT_SYNTHETIX];

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    function _gasTank() internal view returns (IGasTank) {
        return IGasTank(requireAndGetAddress(CONTRACT_GASTANK, "Missing GasTank address"));
    }

    function _synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function spendGas(address payable _account) public {
        uint gasConsumed = gasleft();
        //we call a random function to consume gas
        _synthetix().collateral(_account);
        gasConsumed -= gasleft();
        _gasTank().payGas(_account, msg.sender, gasConsumed);
    }
}
