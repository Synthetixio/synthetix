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

/* TODO:
 *     * Finish nomin-specific functions
 *     * Finish ERC20 interface functions
 *     * Fix all compiler warnings
 *     * Ensure function modifiers are all correct
 *     * Event logging
 *     * A notion of stale prices
 *     * Consensys best practice compliance
 *     * Solium lint
 *     * Make contract pausable in case of bug
 *     * Make contract upgradeable in case of bug
 *     * Rate limiting?
 *     * Test suite
 *     * Bug bounties?
 */
pragma solidity ^0.4.19;

/* Safely manipulate fixed-point decimals at a given precision level. */
contract SafeFixedMath {
    uint public constant decimals = 18;
    uint public constant unit = 10 ** decimals;
    
    function addSafe(uint x, uint y) pure internal returns (bool) {
        return x + y >= y;
    }

    function add(uint x, uint y) pure internal returns (uint) {
        assert(addSafe(x, y));
        return x + y;
    }
    
    function subSafe(uint x, uint y) pure internal returns (bool) {
        return y <= x;
    }

    function sub(uint x, uint y) pure internal returns (uint) {
        assert(subSafe(x, y));
        return x - y;
    }
    
    function mulSafe(uint x, uint y) pure internal returns (bool) {
        if (x == 0) {
            return true;
        }
        uint r = x * y;
        return r / x == y;
    }

    function mul(uint x, uint y) pure internal returns (uint) {
        assert(mulSafe(x, y));
        return (x * y) / unit;
    }
    
    function divSafe(uint x, uint y) pure internal returns (bool) {
        return y != 0;
    }

    function div(uint x, uint y) pure internal returns (uint) {
        assert(mulSafe(x, unit)); // No need to use divSafe() here, as a 0 denominator already throws.
        return (x * unit) / y;
    }
}


contract ERC20Token is SafeFixedMath {
    // Total nomins in the pool or in circulation.
    // Supply is initially zero, but may be increased by the Havven foundation.
    uint supply = 0;
 
    // Nomin balances for each address.
    mapping(address => uint) balances;

    // Nomin proxy transfer allowances.
    mapping(address => mapping (address => uint256)) allowances;
   
    // Get the total token supply
    function totalSupply() public constant returns (uint) {
        return supply;
    }
 
    // Get the account balance of another account with address _account
    function balanceOf(address _account) public constant returns (uint) {
        return balances[_account];
    }
 
    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value) public returns (bool) {
        if (subSafe(balances[msg.sender], _value) && addSafe(balances[_to], _value)) {
            balances[msg.sender] = sub(balances[msg.sender], _value);
            balances[_to] = add(balances[_to], _value);
            Transfer(msg.sender, _to, _value);
            return true;
        }
        return false;
    }
 
    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint _value) public returns (bool) {
        if (subSafe(balances[_from], _value) &&
            subSafe(allowances[_from][msg.sender], _value) &&
            addSafe(balances[_to], _value)) {
                balances[_from] = sub(balances[_from], _value);
                allowances[_from][msg.sender] = sub(allowances[_from][msg.sender], _value);
                balances[_to] = add(balances[_to], _value);
                Transfer(_from, _to, _value);
                return true;
        }
        return false;
    }
  
    // Allow _spender to withdraw from your account, multiple times, up to the _value amount.
    // If this function is called again it overwrites the current allowance with _value.
    // this function is required for some DEX functionality
    function approve(address _spender, uint _value) public returns (bool) {
        allowances[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }
 
    // Returns the amount which _spender is still allowed to withdraw from _owner
    function allowance(address _owner, address _spender) public constant returns (uint) {
        return allowances[_owner][_spender];
    }
 
    // Triggered when tokens are transferred.
    event Transfer(address indexed _from, address indexed _to, uint _value);
 
    // Triggered whenever approve(address _spender, uint _value) is called.
    event Approval(address indexed _owner, address indexed _spender, uint _value);
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
contract CollateralisedNomin is ERC20Token {
    // The contract's owner (the Havven foundation multisig command contract).
    address owner;

    // The oracle provides price information to this contract.
    address oracle;

    // Foundation wallet for funds to go to post self-destruct.
    address beneficiary;
    
    // ERC20 information
    string public constant name = "Collateralised Nomin";
    string public constant symbol = "CNOM";

    // Nomins in the pool ready to be sold.
    uint public pool = 0;
    
    // Impose a 10 basis-point fee for buying and selling.
    uint public fee = unit / 1000;
    
    // Ether price from oracle ($/nom), and the time it was read.
    uint public lastEtherPrice;
    
    // The time that must pass before the liquidation period is
    // complete
    uint private liquidationPeriod = 1 years;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the 
    // liquidation timestamp is in the past.
    uint private liquidationTimestamp = ~uint(0);
    
    function CollateralisedNomin(address _owner, address _oracle,
                                 address _beneficiary, uint initialEtherPrice) {
        owner = _owner;
        oracle = _oracle;
        beneficiary = _beneficiary;
        lastEtherPrice = initialEtherPrice;
    }

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    modifier onlyOracle {
        require(msg.sender == oracle);
        _;
    }

    modifier notLiquidating {
        require(!isLiquidating());
        _;
    }
 
    function setOwner(address newOwner) public onlyOwner {
        owner = newOwner;
    }   
    function setOracle(address newOracle) public onlyOwner {
        oracle = newOracle;
    }

    function setBeneficiary(address newBeneficiary) public onlyOwner {
        beneficiary = newBeneficiary;
    }

    function usdValue(uint eth) public view returns (uint) {
        return mul(eth, lastEtherPrice);
    }

    function usdBalance() public view returns (uint) {
        return usdValue(this.balance);
    }
    
    function etherValue(uint usd) public view returns (uint) {
        return div(usd, lastEtherPrice);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of eth.
     * Exceptional conditions:
     *     Not called by contract owner;
     *     Insufficient backing funds provided;
     *     Unavailable or stale price data; 
     *     n below some minimum;
     *     contract in liquidation. */
    function issue(uint n) public onlyOwner notLiquidating payable {
        require(usdValue(msg.value) >= n);
        supply = add(supply, n);
        pool = add(pool, n);
    }
    
    /* Sends n nomins to the sender from the pool, in exchange for
     * $n plus the fee worth of eth.
     * Exceptional conditions:
     *     Insufficient funds provided;
     *     More nomins requested than are in the pool;
     *     Unavailable or stale price data;
     *     n below some minimum;
     *     contract in liquidation; */
    function buy(uint n) public notLiquidating payable {
        require(usdValue(msg.value) >= mul(n, add(unit, fee)));
        // sub requires that pool >= n
        pool = sub(pool, n);
        balances[msg.sender] = balances[msg.sender] + n;
    }
    
    /* Return the ether cost (including fee) of purchasing n
     * nomins. */
    function purchaseCostEther(uint n) public view returns (uint) {
        return etherValue(mul(n, add(unit, fee)));
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of eth.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet;
     *     Insufficient funds in the pool to pay sender // TODO: work out a discounted rate?;
     *     Unavailable or stale price data;
     *     n below some minimum;
     *     contract in liquidation; */
    function sell(uint n) public {
        uint proceeds = mul(n, sub(unit, fee));
        require(usdBalance() >= proceeds);
        // sub requires that the balance is greater than n
        balances[msg.sender] = sub(balances[msg.sender], n);
        pool = add(pool, n);
        msg.sender.transfer(proceeds);
    }
    
    /* Return the ether proceeds (less the fee) of selling n
     * nomins. */
    function sellProceedsEther(uint n) public view returns (uint) {
        return etherValue(mul(n, sub(unit, fee)));
    }

    /* Update the current eth price and update the last updated time;
       only usable by the oracle. */
    function updatePrice(uint price) public onlyOracle {
        lastEtherPrice = price;
    }
    
    /* True iff the liquidation block is earlier than the current block.*/
    function isLiquidating() public view returns (bool) {
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
    function liquidate() public onlyOwner notLiquidating {
        liquidationTimestamp = now;
    }
    
    /* Destroy this contract, returning all funds back to the Havven
     * foundation, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod blocks.
     * Exceptional cases:
     *     Contract is not in liquidation;
     *     Contract has not been in liquidation for at least liquidationPeriod;
     *     Not called by contract owner;
     */
    function selfDestruct() public onlyOwner {
        require(liquidationTimestamp + liquidationPeriod < now);
        selfdestruct(beneficiary);
    }
}
