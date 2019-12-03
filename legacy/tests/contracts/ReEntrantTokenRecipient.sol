pragma solidity ^0.4.24;

import "tests/contracts/PublicEST.sol";

contract ReEntrantTokenRecipient {
    event TokenFallbackCalled(address from, uint value, bytes data);

    function tokenFallback(address from, uint value, bytes data) public {
        emit TokenFallbackCalled(from, value, data);

        PublicEST(msg.sender).transferFrom(from, this, value);
    }
}