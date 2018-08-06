pragma solidity ^0.4.24;

import "tests/contracts/PublicEST.sol";

contract ReEntrantTokenRecipient {
    event TokenFallbackCalled(address from, uint value);

    function havvenTokenFallback(address from, uint value) public {
        emit TokenFallbackCalled(from, value);

        PublicEST(msg.sender).transferFrom(from, this, value);
    }
}