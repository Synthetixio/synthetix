/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       HavvenAlpha.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic
            Samuel Brooks

date:       2017-12-4

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------
Alpha ether-backed alpha nomin stablecoin contract.


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
- Initial scaffolding of nomin alpha contract. It will require
a price oracle to run externally.

-----------------------------------------------------------------
Block8 Technologies are accelerating blockchain technology
through incubating meaningful, next-generation businesses.
Find out more at block8.io
-----------------------------------------------------------------

*/

contract ERC20Token {
    // Get the total token supply
    function totalSupply() constant returns (uint totalSupply);
 
    // Get the account balance of another account with address _owner
    function balanceOf(address _owner) constant returns (uint balance);
 
    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value) returns (bool success);
 
    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint _value) returns (bool success);
  
    // Allow _spender to withdraw from your account, multiple times, up to the _value amount.
    // If this function is called again it overwrites the current allowance with _value.
    // this function is required for some DEX functionality
    function approve(address _spender, uint _value) returns (bool success);
 
    // Returns the amount which _spender is still allowed to withdraw from _owner
    function allowance(address _owner, address _spender) constant returns (uint remaining);
 
    // Triggered when tokens are transferred.
    event Transfer(address indexed _from, address indexed _to, uint _value);
 
    // Triggered whenever approve(address _spender, uint _value) is called.
    event Approval(address indexed _owner, address indexed _spender, uint _value);
}

contract FixedMath {
    uint public constant precision = 18;
    uint public constant unit = 10 ** decimals;

    function add(uint x, uint y) pure internal {

    }
}


/* Issues nomins, which are tokens worth 1 USD each. They are backed
 * by a pool of eth collateral, so that if a user has nomins, they may
 * redeem them for eth from the pool, or if they want to obtain nomins,
 * they may pay eth into the pool in order to do so.
 * 
 * There is a limited pool of nomins that may be in circulation at any
 * time, and the contract owner may increase this pool, but only
 * if they provide enough backing collateral to maintain the ratio.
 *  The contract owner may issue nomins, initiate contract liquidation
 */
contract CollateralisedNomin is ERC20Token, FixedMath {
    // The contract's owner (the Havven foundation multisig command contract).
    address owner;

    // The oracle provides price information to this contract.
    address oracle;
    
    // ERC20 information
    string public constant name = "Collateralised Nomin";
    string public constant symbol = "CNOM"
    uint public constant decimals = precision;
    
    // Total nomins in the pool or in circulation.
    // Supply is initially zero, but may be increased by the Havven foundation.
    uint supply = 0;
    
    // Nomins in the pool ready to be sold.
    uint pool = 0;
    
    // Ether price from oracle, and the time it was read.
    uint lastEtherPrice;
    uint lastPriceUpdateBlock;
    
    // The time that must pass before the liquidation period is
    // complete
    uint private liquidationPeriod = 1 years;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the 
    // liquidation timestamp is in the past.
    uint private liquidationTimestamp = ~uint(0);
    
    function CollateralisedNomin(address oracleContract) {
        oracle = oracle;
        oracleContract.setTarget(address(this));
    }

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    modifier onlyOracle {
        require(msg.sender == oracle);
        _;
    }

    modified notLiquidating {
        require(!isLiquidating());
        _;
    }
    
    function setOracle(address newOracle) onlyOwner {
        oracle = newOracle;
    }

    function setOwner(address newOwner) onlyOwner {
        owner = newOwner;
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of eth.
     * Exceptional conditions:
     *     Not called by contract owner;
     *     Insufficient backing funds provided;
     *     Unavailable or stale price data; 
     *     n below some minimum;
     *     contract in liquidation. */
    function issue(uint n) onlyOwner, notLiquidating {
        // FILL ME
    }
    
    /* Sends n nomins to the sender from the pool, in exchange for
     * $n worth of eth.
     * Exceptional conditions:
     *     Insufficient funds provided;
     *     More nomins requested than are in the pool;
     *     Unavailable or stale price data;
     *     n below some minimum;
     *     contract in liquidation; */
    function buy(uint n) notLiquidating {
        // FILL ME
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n worth of eth.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet;
     *     Insufficient funds in the pool to pay sender // TODO: work out a discounted rate?;
     *     Unavailable or stale price data;
     *     n below some minimum;
     *     contract in liquidation; */
    function sell(uint n) {
        // FILL ME
    }

    /* Update the current eth price and update the last updated time;
       only usable by the oracle. */
    function updatePrice(uint price) onlyOracle {
        lastEtherPrice = price;
        lastPriceUpdateBlock = now;
    }
    
    /* True iff the liquidation block is earlier than the current block.*/
    function isLiquidating() returns (bool) {
        return liquidationTimestamp <= now;
    }

    /* Lock all functions except sell(). While the contract is under
     * liquidation, users may sell nomins back to the system. After
     * liquidation period has terminated, the contract may be self-destructed,
     * returning all remaining eth to the Havven foundation.
     * Exceptional cases:
     *     Not called by contract owner;
     *     contract already in liquidation;
     */
    function liquidate() onlyOwner, notLiquidating {
        // FILL ME
    }
    
    /* Destroy this contract, returning all funds back to the Havven
     * foundation, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod blocks.
     * Exceptional cases:
     *     Contract is not in liquidation;
     *     Contract has not been in liquidation for at least liquidationPeriod;
     *     Not called by contract owner;
     */
    function selfDestruct() onlyOwner {
       // FILL ME
    }
}
