pragma solidity ^0.8.9;

contract MockReverter {
    function revertWithMsg(string calldata _msg) external pure {
        revert(_msg);
    }
}
