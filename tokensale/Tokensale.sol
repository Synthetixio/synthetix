/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Tokensale.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic
            Samuel Brooks

date:       2017-11-31

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------
Token sale contract for the Havven stablecoin system.


-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2017 Havven.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
    
-----------------------------------------------------------------
RELEASE NOTES
-----------------------------------------------------------------
- Initial scaffolding of tokensale contract. Interfaces to other
contracts holding core Havven (alpha version) functionality.


-----------------------------------------------------------------
Block8 Technologies are accelerating blockchain technology
through incubating meaningful, next-generation businesses.
Find out more at block8.io
-----------------------------------------------------------------

*/


pragma solidity ^0.4.19

/*  Configuration parameters for Havven token sale contract 

    Owner:
    Has power to abort, discount addresses, sweep funds,
    change owner, sweep alien tokens.


    FUND_WALLET:
    Owning address of the raised funds. Must be checksummed address.

    START_DATE:
    Date after which the token sale will be live.

    MAX_FUNDING_PERIOD:
    Period of time the tokensale will be live. Note that the owner
    can finalise the contract early.
    

*/

contract HavvenConfig {

    string public        name               = "Havven";
    string public        symbol             = "HVN";
    address public       owner              = msg.sender;
    address public       FUND_WALLET        = 0x0;
    uint public constant MAX_TOKENS         = 150000000;
    uint public constant START_DATE         = 1502668800;
    uint public constant MAX_FUNDING_PERIOD = 60 days;
}

library SafeMath {

    // a add to b
    function add(uint a, uint b) internal returns (uint c) {
        c = a + b;
        assert(c >= a);
    }
    
    // a subtract b
    function sub(uint a, uint b) internal returns (uint c) {
        c = a - b;
        assert(c <= a);
    }
    
    // a multiplied by b
    function mul(uint a, uint b) internal returns (uint c) {
        c = a * b;
        assert(a == 0 || c / a == b);
    }
    
    // a divided by b
    function div(uint a, uint b) internal returns (uint c) {
        c = a / b;
        // No assert required as no overflows are posible.
    }

}

contract Havven {

    

}
