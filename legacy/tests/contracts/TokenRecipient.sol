pragma solidity ^0.4.24;

contract TokenRecipient {
    event TokenFallbackCalled(address from, uint value, bytes data);

    function tokenFallback(address from, uint value, bytes data) public {
        emit TokenFallbackCalled(from, value, data);
    }
}