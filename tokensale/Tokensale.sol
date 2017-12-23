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

    /// @dev The Hut34 vesting 'psudo-address' for transferring and releasing
    /// vested tokens to the Hut34 Wallet. The address is UTF8 encoding of the
    /// string and can only be accessed by the 'releaseVested()' function.
    /// @return `0x48757433342056657374696e6700000000000000`
 //   address public constant HUT34_VEST_ADDR = address(bytes20("Hut34 Vesting"));

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


//  -----------------------------------------------------------------
//  STATE VARIABLES

    uint public totalSupply;
    mapping (address => uint) balances;
    mapping (address => mapping (address => uint)) allowed;
 
//  -----------------------------------------------------------------
//  EVENTS
 
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

//  -----------------------------------------------------------------
//  FUNCTIONS

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

contract HavvenTokenSaleAbstract {

//  -----------------------------------------------------------------
//  EVENTS

    event Deposit(address indexed _from, uint _value);
    event Withdrawal(address indexed _from, address indexed _to, uint _value);
    event OwnerChangeComplete(address indexed _from, address indexed _to);
    event OwnerChangeInit(address indexed _to); // initiates contract owner change
    event ContractAborted();
    
    /// @dev Logged when a funder exceeds the KYC limit
    /// @param _addr Address to set or clear KYC flag
    /// @param _kyc A boolean flag
    // event KycExceeded(address indexed _addr, bool _kyc);

    /// @dev Logged when vested tokens are released back to HUT32_WALLET
    /// @param _releaseDate The official release date (even if released at
    /// later date)
    // event VestingReleased(uint _releaseDate);


//  -----------------------------------------------------------------
//  STATE VARIABLES

    /// @dev This fuse blows upon calling abort() which forces a fail state
    /// @return the abort state. true == not aborted
    bool public __abortFuse = true;

    /// @dev Sets to true after the fund is swept to the fund wallet, allows
    /// token transfers and prevents abort()
    /// @return final success state of TS
    bool public tsSucceeded;

    /// @dev An address permissioned to enact owner restricted functions
    /// @return owner
    address public owner;

    /// @dev An address permissioned to take ownership of the contract
    /// @return new owner address
    address public newOwner;

    /// @dev A tally of total ether raised during the funding period
    /// @return Total ether raised during funding
    uint public etherRaised;

    /// @return Wholesale tokens available for sale
    uint public wholesaleLeft;

    /// @return Total ether refunded. Used to permision call to `destroy()`
    uint public refunded;

    /// @returns Date of next vesting release
    uint public nextReleaseDate;

    /// @return Ether paid by an address
    mapping (address => uint) public etherContributed;

    /// @returns KYC flag for an address
    mapping (address => bool) public mustKyc;

//  -----------------------------------------------------------------
//  MODIFIERS

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

//  -----------------------------------------------------------------
//  FUNCTION ABSTRACTS

    /// @return `true` if MIN_FUNDS were raised
    function fundRaised() public view returns (bool);

    /// @return `true` if MIN_FUNDS were not raised before END_DATE or contract
    /// has been aborted
    function fundFailed() public view returns (bool);

    /// @return The current retail rate for token purchase
    function currentRate() public view returns (uint);

    /// @param _wei A value of ether in units of wei
    /// @return allTokens_ returnable tokens for the funding amount
    /// @return wholesaleToken_ Number of tokens purchased at wholesale rate
    function ethToTokens(uint _wei)
        public view returns (uint allTokens_, uint wholesaleTokens_);

    /// @notice Processes a token purchase for `_addr`
    /// @param _addr An address to purchase tokens
    /// @return Boolean success value
    /// @dev Requires <150,000 gas
    function proxyPurchase(address _addr) public payable returns (bool);

    /// @notice Finalize the TS and transfer funds
    /// @return Boolean success value
    function finalizeTS() public returns (bool);

    /// @notice Clear the KYC flags for an array of addresses to allow tokens
    /// transfers
    function clearKyc(address[] _addrs) public returns (bool);

    /// @notice Make bulk transfer of tokens to many addresses
    /// @param _addrs An array of recipient addresses
    /// @param _amounts An array of amounts to transfer to respective addresses
    /// @return Boolean success value
    function transferToMany(address[] _addrs, uint[] _amounts)
        public returns (bool);

    /// @notice Release vested tokens after a maturity date
    /// @return Boolean success value
    function releaseVested() public returns (bool);

    /// @notice Claim refund on failed TS
    /// @return Boolean success value
    function refund() public returns (bool);

    /// @notice Push refund for `_addr` from failed TS
    /// @param _addrs An array of address to refund
    /// @return Boolean success value
    function refundFor(address[] _addrs) public returns (bool);

    /// @notice Abort the token sale prior to finalizeTS()
    function abort() public returns (bool);

    /// @notice Salvage `_amount` tokens at `_kaddr` and send them to `_to`
    /// @param _kAddr An ERC20 contract address
    /// @param _to and address to send tokens
    /// @param _amount The number of tokens to transfer
    /// @return Boolean success value
    function transferExternalToken(address _kAddr, address _to, uint _amount)
        public returns (bool);

}
