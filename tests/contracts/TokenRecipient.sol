pragma solidity ^0.4.24;

contract TokenRecipient {
    event TokenFallbackCalled(address from, uint value);

    function havvenTokenFallback(address from, uint value) public {
        emit TokenFallbackCalled(from, value);
    }
}