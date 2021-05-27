pragma solidity ^0.5.16;

import "../interfaces/IKeeper.sol";
import "../interfaces/IKeeperRegistry.sol";

contract LimitedKeeperRegistry is IKeeperRegistry {
    uint256 private constant CUSHION = 5_000;

    struct Upkeep {
        IKeeper target;
        uint32 gasLimit;
        address admin;
        bytes checkData;
    }

    mapping(uint => Upkeep) upkeeps;

    uint upkeepCounter = 0;

    function registerUpkeep(
        address target,
        uint32 gasLimit,
        address admin,
        bytes calldata checkData
    ) external returns (uint256 id) {
        Upkeep memory upkeep = Upkeep({target: IKeeper(target), gasLimit: gasLimit, admin: admin, checkData: checkData});
        upkeepCounter += 1;
        upkeeps[upkeepCounter] = upkeep;

        emit UpkeepRegistered(id, gasLimit, admin);
        return id;
    }

    function performUpkeep(uint256 id, bytes calldata performData) external returns (bool success) {
        Upkeep storage upkeep = upkeeps[id];
        upkeep.target.performUpkeep(performData);

        emit UpkeepPerformed(id, success, msg.sender, 0, performData);
        return true;
    }

    function cancelUpkeep(uint256 id) external {
        emit UpkeepCanceled(id, uint64(block.number));
        delete upkeeps[id];
    }

    function checkUpkeep(uint256 upkeepId, address from)
        external
        returns (
            bytes memory performData,
            uint256 maxLinkPayment,
            uint256 gasLimit,
            int256 gasWei,
            int256 linkEth
        )
    {
        Upkeep storage upkeep = upkeeps[upkeepId];

        (bool success, bytes memory performData) = upkeep.target.checkUpkeep(upkeep.checkData);
        require(success, "upkeep not needed");

        bytes memory callData = abi.encodeWithSelector(upkeep.target.performUpkeep.selector, performData);
        success = callWithExactGas(gasLimit, address(upkeep.target), callData);
        require(success, "call to perform upkeep failed");

        return (performData, maxLinkPayment, gasLimit, gasWei, linkEth);
    }

    function callWithExactGas(
        uint256 gasAmount,
        address target,
        bytes memory data
    ) private returns (bool success) {
        assembly {
            let g := gas()
            // Compute g -= CUSHION and check for underflow
            if lt(g, CUSHION) {
                revert(0, 0)
            }
            g := sub(g, CUSHION)
            // if g - g//64 <= gasAmount, revert
            // (we subtract g//64 because of EIP-150)
            if iszero(gt(sub(g, div(g, 64)), gasAmount)) {
                revert(0, 0)
            }
            // solidity calls check that a contract actually exists at the destination, so we do the same
            if iszero(extcodesize(target)) {
                revert(0, 0)
            }
            // call and return whether we succeeded. ignore return data
            success := call(gasAmount, target, 0, add(data, 0x20), mload(data), 0, 0)
        }
        return success;
    }
}
