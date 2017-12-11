/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       CollateralisedNomin.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2017-12-4

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------
Ether-backed nomin stablecoin contract.


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
 *     * Decide what to do if the ether backing is exhausted. For example:
 *         - discount nomins once backing is too low: e.g. if $900k ether backs 1m nom, each nom is worth 90c
 *         - automatically liquidate system once backing is low
 *     * Break contract config out into its own contract to inherit from.
 *     * Provide a pool-shrinking function.
 *     * Consider adding a notion of price staleness.
 *     * Consider if people emptying the collateral by hedging is a problem:
 *         Having no fee is effectively offering a short position for free. But if the volatility of ether is ~10% a day or so
 *         then a 10% fee required to make betting on it is probably too high to get people to actually buy these things.
 *         Probably can add a time lock for selling nomins back to the system, but it's awkward, and just makes the futures contract
 *         slightly longer term.
 *     * Consider whether to break configuration out into its own contract to inherit from.
 *     * Ensure satisfies all nomin contract features.
 *     * Ensure ERC20-compliant.
 *     * Ensure function modifiers are all correct.
 *     * Event logging for nomin functions.
 *     * Consensys best practices compliance.
 *     * Solium lint.
 *     * Test suite.
 */
pragma solidity ^0.4.19;

/* Safely manipulate fixed-point decimals at a given precision level. */
contract SafeFixedMath {
    
    // Number of decimal places in the representation.
    uint public constant decimals = 18;

    // The number representing 1.0.
    uint public constant unit = 10 ** decimals;
    
    /* True iff adding x and y will not overflow. */
    function addSafe(uint x, uint y) 
        pure
        internal
        returns (bool)
    {
        return x + y >= y;
    }

    /* Return the result of adding x and y, throwing an exception in case of overflow. */
    function add(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        assert(addSafe(x, y));
        return x + y;
    }
    
    /* True iff subtracting y from x will not overflow in the negative direction. */
    function subSafe(uint x, uint y)
        pure
        internal
        returns (bool)
    {
        return y <= x;
    }

    /* Return the result of subtracting y from x, throwing an exception in case of overflow. */
    function sub(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        assert(subSafe(x, y));
        return x - y;
    }
    
    /* True iff multiplying x and y would not overflow. */
    function mulSafe(uint x, uint y)
        pure
        internal
        returns (bool) 
    {
        if (x == 0) {
            return true;
        }
        uint r = x * y;
        return r / x == y;
    }

    /* Return the result of multiplying x and y, throwing an exception in case of overflow. */
    function mul(uint x, uint y)
        pure 
        internal 
        returns (uint)
    {
        assert(mulSafe(x, y));
        // Divide by unit to remove the extra factor introduced by the product.
        return (x * y) / unit;
    }
    
    /* True iff the denominator of x/y is nonzero. */
    function divSafe(uint x, uint y)
        pure 
        internal
        returns (bool)
    {
        return y != 0;
    }

    /* Return the result of dividing x by y, throwing an exception in case of overflow or zero divisor. */
    function div(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        assert(mulSafe(x, unit)); // No need to use divSafe() here, as a 0 denominator already throws.
        // Reintroduce the unit factor that will be divided out.
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
    function totalSupply()
        public
        constant
        returns (uint)
    {
        return supply;
    }
 
    // Get the account balance of another account with address _account
    function balanceOf(address _account)
        public
        constant
        returns (uint)
    {
        return balances[_account];
    }
 
    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        if (subSafe(balances[msg.sender], _value) &&
            addSafe(balances[_to], _value)) {
            Transfer(msg.sender, _to, _value);
            if (_value == 0) return true; // Don't spend gas updating state if unnecessary.
            balances[msg.sender] = sub(balances[msg.sender], _value);
            balances[_to] = add(balances[_to], _value);
            return true;
        }
        return false;
    }
 
    // Send _value amount of tokens from address _from to address _to
    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        if (subSafe(balances[_from], _value) &&
            subSafe(allowances[_from][msg.sender], _value) &&
            addSafe(balances[_to], _value)) {
                Transfer(_from, _to, _value);
                if (_value == 0) return true; // Don't spend gas updating state if unnecessary.
                balances[_from] = sub(balances[_from], _value);
                allowances[_from][msg.sender] = sub(allowances[_from][msg.sender], _value);
                balances[_to] = add(balances[_to], _value);
                return true;
        }
        return false;
    }
  
    // Allow _spender to withdraw from your account, multiple times, up to the _value amount.
    // If this function is called again it overwrites the current allowance with _value.
    // this function is required for some DEX functionality.
    function approve(address _spender, uint _value)
        public
        returns (bool)
    {
        allowances[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }
 
    // Returns the amount which _spender is still allowed to withdraw from _owner
    function allowance(address _owner, address _spender)
        public
        constant
        returns (uint)
    {
        return allowances[_owner][_spender];
    }
 
    // Triggered when tokens are transferred.
    event Transfer(address indexed _from, address indexed _to, uint _value);
 
    // Triggered whenever approve(address _spender, uint _value) is called.
    event Approval(address indexed _owner, address indexed _spender, uint _value);
}

/* Issues nomins, which are tokens worth 1 USD each. They are backed
 * by a pool of ether collateral, so that if a user has nomins, they may
 * redeem them for ether from the pool, or if they want to obtain nomins,
 * they may pay ether into the pool in order to do so. 
 * 
 * The supply of nomins that may be in circulation at any time is limited.
 * The contract owner may increase this quantity, but only if they provide
 * ether to back it. The backing they provide must be at least 1-to-1
 * nomin to USD value of the ether collateral. In this way each nomin is
 * at least 2x overcollateralised.
 *
 * Ether price is continually updated by an external oracle, and the value
 * of the backing is computed on this basis.
 *
 * The contract owner may at any time initiate contract liquidation.
 * During the liquidation period, most contract functions will be deactivated.
 * No new nomins may be issued or bought, but users may sell nomins back
 * to the system.
 * After the liquidation period has elapsed, which is initially a year,
 * the owner may destroy the contract, transferring any remaining collateral
 * to a nominated beneficiary address.
 * This liquidation period may be extended up to a maximum of two years.
 */
contract CollateralisedNomin is ERC20Token {

    /* The contract's owner.
     * This should point to the Havven foundation multisig command contract.
     * Only the owner may perform the following:
     *   - Setting the owner;
     *   - Setting the oracle;
     *   - Setting the beneficiary;
     *   - Issuing new nomins into the pool; 
     *   - Initiating and extending liquidation;
     *   - Selfdestructing the contract*/
    address owner;

    // The oracle provides price information to this contract.
    // It may only call the setPrice() function.
    address oracle;

    // Foundation wallet for funds to go to post liquidation.
    address beneficiary;
    
    // ERC20 token information.
    string public constant name = "Collateralised Nomin";
    string public constant symbol = "CNOM";

    // Nomins in the pool ready to be sold.
    uint public pool = 0;
    
    // Impose a 50 basis-point fee for buying and selling.
    uint public fee = unit / 200;
    
    // Minimum quantity of nomins purchasable: 1 cent by default.
    uint public purchaseMininum = unit / 100;
    
    // Ether price from oracle (USD per eth).
    uint public etherPrice;
    
    // The time that must pass before the liquidation period is
    // complete
    uint public liquidationPeriod = 1 years;
    
    // The liquidation period can be extended up to this duration.
    uint public maxLiquidationPeriod = 2 years;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the 
    // liquidation timestamp is in the past.
    uint public liquidationTimestamp = ~uint(0);


    function CollateralisedNomin(address _owner, address _oracle,
                                 address _beneficiary, uint initialEtherPrice)
    {
        owner = _owner;
        oracle = _oracle;
        beneficiary = _beneficiary;
        etherPrice = initialEtherPrice;
    }

    modifier onlyOwner
    {
        require(msg.sender == owner);
        _;
    }

    modifier onlyOracle
    {
        require(msg.sender == oracle);
        _;
    }

    modifier notLiquidating
    {
        require(!isLiquidating());
        _;
    }
 
    function setOwner(address newOwner)
        public
        onlyOwner
    {
        owner = newOwner;
    }   
    
    function setOracle(address newOracle)
        public
        onlyOwner
    {
        oracle = newOracle;
    }
    
    function setBeneficiary(address newBeneficiary)
        public
        onlyOwner
    {
        beneficiary = newBeneficiary;
    }
    
    /* Return the equivalent usd value of the given quantity
     * of ether at the current price. */
    function usdValue(uint eth)
        public
        view
        returns (uint)
    {
        return mul(eth, etherPrice);
    }
    
    /* Return the current USD value of the contract's balance. */
    function usdBalance()
        public
        view
        returns (uint)
    {
        return usdValue(this.balance);
    }
    
    /* Return the equivalent ether value of the given quantity
     * of usd at the current price. */
    function etherValue(uint usd)
        public
        view
        returns (uint)
    {
        return div(usd, etherPrice);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of ether.
     * Exceptional conditions:
     *     Not called by contract owner;
     *     Insufficient backing funds provided;
     *     Unavailable or stale price data; 
     *     n below some minimum;
     *     contract in liquidation. */
    function issue(uint n)
        public
        onlyOwner
        notLiquidating
        payable
    {
        require(usdValue(msg.value) >= n);
        supply = add(supply, n);
        pool = add(pool, n);
    }
    
    /* Sends n nomins to the sender from the pool, in exchange for
     * $n plus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient funds provided;
     *     More nomins requested than are in the pool;
     *     Unavailable or stale price data;
     *     n below the purchase minimum (1 cent);
     *     contract in liquidation; */
    function buy(uint n)
        public
        notLiquidating
        payable
    {
        require(n >= purchaseMininum &&
                usdValue(msg.value) >= mul(n, add(unit, fee)));
        // sub requires that pool >= n
        pool = sub(pool, n);
        balances[msg.sender] = balances[msg.sender] + n;
    }
    
    /* Return the ether cost (including fee) of purchasing n
     * nomins. */
    function purchaseCostEther(uint n)
        public
        view
        returns (uint)
    {
        return etherValue(mul(n, add(unit, fee)));
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet;
     *     Insufficient funds in the pool to pay sender
     *     Unavailable or stale price data;
     *     contract in liquidation; */
    function sell(uint n)
        public
    {
        uint proceeds = mul(n, sub(unit, fee));
        require(usdBalance() >= proceeds);
        // sub requires that the balance is greater than n
        balances[msg.sender] = sub(balances[msg.sender], n);
        pool = add(pool, n);
        msg.sender.transfer(proceeds);
    }
    
    /* Return the ether proceeds (less the fee) of selling n
     * nomins. */
    function saleProceedsEther(uint n)
        public
        view
        returns (uint)
    {
        return etherValue(mul(n, sub(unit, fee)));
    }

    /* Update the current ether price and update the last updated time;
       only usable by the oracle. */
    function setPrice(uint price)
        public
        onlyOracle
    {
        etherPrice = price;
    }

    /* Lock nomin purchase and issuance functions in preparation for destroying the contract.
     * While the contract is under liquidation, users may sell nomins back to the system.
     * After liquidation period has terminated, the contract may be self-destructed,
     * returning all remaining ether to the Havven foundation.
     * Exceptional cases:
     *     Not called by contract owner;
     *     contract already in liquidation;
     */
    function liquidate()
        public
        onlyOwner
        notLiquidating
    {
        liquidationTimestamp = now;
    }

    /* Extend the liquidation period. It may only get longer,
     * not shorter, and it may not be extended past the liquidation max. */
    function extendLiquidationPeriod(uint extension)
        public
        onlyOwner
    {
        require(liquidationPeriod + extension <= maxLiquidationPeriod);
        liquidationPeriod += extension;
    }
    
    /* True iff the liquidation block is earlier than the current block.*/
    function isLiquidating()
        public
        view
        returns (bool)
    {
        return liquidationTimestamp <= now;
    }
    
    /* Destroy this contract, returning all funds back to the Havven
     * foundation, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod blocks.
     * Exceptional cases:
     *     Contract is not in liquidation;
     *     Contract has not been in liquidation for at least liquidationPeriod;
     *     Not called by contract owner;
     */
    function selfDestruct()
        public
        onlyOwner
    {
        require(liquidationTimestamp + liquidationPeriod < now);
        selfdestruct(beneficiary);
    }
}
