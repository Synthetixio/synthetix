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
    `node> + new Date('1 February 2018 GMT+0')/1000`

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
    uint public constant START_DATE         = 1517443200;
    uint public constant MAX_FUNDING_PERIOD = 60 days;
}

library SafeMath {

    // a add to b
    function add(uint a, uint b) internal pure returns (uint c) {
        c = a + b;
        assert(c >= a);
    }

    // a subtract b
    function sub(uint a, uint b) internal pure returns (uint c) {
        c = a - b;
        assert(c <= a);
    }

    // a multiplied by b
    function mul(uint a, uint b) internal pure returns (uint c) {
        c = a * b;
        assert(a == 0 || c / a == b);
    }

    // a divided by b
    function div(uint a, uint b) internal pure returns (uint c) {
        assert(b != 0);
        c = a / b;
    }
}


contract ERC20Token {

    using SafeMath for uint;

    /* State variables */

    uint public totalSupply;
    mapping (address => uint) balances;
    mapping (address => mapping (address => uint)) allowed;

    
    
    /* Events */

    event Transfer(
        address indexed _from,
        address indexed _to,
        uint256 _amount
    );

    event Approval(
        address indexed _owner,
        address indexed _spender,
        uint256 _amount
    );



    /* Functions */

    // Using an explicit getter allows for function overloading
    function balanceOf(address _addr)
        public
        view
        returns (uint)
    {
        return balances[_addr];
    }

    // Using an explicit getter allows for function overloading
    function allowance(address _owner, address _spender)
        public
        constant
        returns (uint)
    {
        return allowed[_owner][_spender];
    }

    // Send _value amount of tokens to address _to
    function transfer(address _to, uint256 _amount)
        public
        returns (bool)
    {
        return xfer(msg.sender, _to, _amount);
    }

    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint256 _amount)
        public
        returns (bool)
    {
        require(_amount <= allowed[_from][msg.sender]);

        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_amount);
        return xfer(_from, _to, _amount);
    }

    // Process a transfer internally.
    function xfer(address _from, address _to, uint _amount)
        internal
        returns (bool)
    {
        require(_amount <= balances[_from]);

        Transfer(_from, _to, _amount);

        // avoid wasting gas on 0 token transfers
        if(_amount == 0) return true;

        balances[_from] = balances[_from].sub(_amount);
        balances[_to]   = balances[_to].add(_amount);

        return true;
    }

    // Approves a third-party spender
    function approve(address _spender, uint256 _amount)
        public
        returns (bool)
    {
        allowed[msg.sender][_spender] = _amount;
        Approval(msg.sender, _spender, _amount);
        return true;
    }
}

contract Havven {

    

}
