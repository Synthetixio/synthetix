pragma solidity ^0.5.16;

contract MockReverter {
    function revertWithMsg(string calldata _msg) external pure {
        revert(_msg);
    }
}
