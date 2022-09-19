pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

contract MockReverter {
    function revertWithMsg(string calldata _msg) external pure {
        revert(_msg);
    }
}
