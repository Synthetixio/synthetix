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
 *     * When the ether backing is exhausted, discount nomins: e.g. if $900k ether backs 1m nom, each nom is worth 90c
 *     * Staleness adjustments:
 *           - solve the trust problem of just setting low stale period and then liquidating
 *           - perhaps staleness protection for sell() is deactivated during the liquidation period
 *           - additionally make staleness predictable by emitting an event on update, and then requiring the current period to elapse before the stale period is actually changed.
 *     * Consider whether people emptying the collateral by hedging is a problem:
 *         Having no fee is effectively offering a short position for free. But if the volatility of ether is ~10% a day or so
 *         then a 10% fee required to make betting on it unprofitable is probably too high to get people to actually buy these things for their intended purpose.
 *         Probably can add a time lock for selling nomins back to the system, but it's awkward, and just makes the futures contract
 *         slightly longer term.
 *     * People must pay exactly the right quantity when buying to prevent overpaying
 *     * Factor out functionality into proxy contract for upgrades.
 *     * Consensys best practices compliance.
 *     * Solium lint.
 *     * Test suite.
 */
pragma solidity ^0.4.19;


/* Safely manipulate fixed-point decimals at a given precision level. 
 * All functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including usd, ether, and
 * nomin quantities). */
contract SafeFixedMath {
    
    // Number of decimal places in the representation.
    uint public constant decimals = 18;

    // The number representing 1.0.
    uint public constant UNIT = 10 ** decimals;
    
    /* True iff adding x and y will not overflow. */
    function addIsSafe(uint x, uint y) 
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
        assert(addIsSafe(x, y));
        return x + y;
    }
    
    /* True iff subtracting y from x will not overflow in the negative direction. */
    function subIsSafe(uint x, uint y)
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
        assert(subIsSafe(x, y));
        return x - y;
    }
    
    /* True iff multiplying x and y would not overflow. */
    function mulIsSafe(uint x, uint y)
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
        assert(mulIsSafe(x, y));
        // Divide by UNIT to remove the extra factor introduced by the product.
        return (x * y) / UNIT;
    }
    
    /* True iff the denominator of x/y is nonzero. */
    function divIsSafe(uint x, uint y)
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
        assert(mulIsSafe(x, UNIT)); // No need to use divIsSafe() here, as a 0 denominator already throws an exception.
        // Reintroduce the UNIT factor that will be divided out.
        return (x * UNIT) / y;
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
        if (subIsSafe(balances[msg.sender], _value) &&
            addIsSafe(balances[_to], _value)) {
            Transfer(msg.sender, _to, _value);
            // Don't spend gas updating state if unnecessary.
            if (_value == 0) {
                return true;
            }
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
        if (subIsSafe(balances[_from], _value) &&
            subIsSafe(allowances[_from][msg.sender], _value) &&
            addIsSafe(balances[_to], _value)) {
                Transfer(_from, _to, _value);
                // Don't spend gas updating state if unnecessary.
                if (_value == 0) {
                    return true;
                }
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
 * at least 2x overcollateralised. The owner may also destroy nomins
 * in the pool, but they must respect the collateralisation requirement.
 *
 * Ether price is continually updated by an external oracle, and the value
 * of the backing is computed on this basis. To ensure the integrity of
 * this system, if the contract's price has not been updated recently enough,
 * it will temporarily disable itself until it receives more price information.
 * 
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
     *   - Burning nomins in the pool;
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
    uint public fee = UNIT / 200;
    
    // Minimum quantity of nomins purchasable: 1 cent by default.
    uint public purchaseMininum = UNIT / 100;
    
    // Ether price from oracle (USD per eth).
    uint public etherPrice;
    
    // Last time the price was updated.
    uint public lastPriceUpdate;

    // The period it takes for the price to be considered stale.
    // If the price is stale, functions that require the price are disabled.
    uint public stalePeriod = 1 day;

    // The time that must pass before the liquidation period is
    // complete
    uint public liquidationPeriod = 1 years;
    
    // The liquidation period can be extended up to this duration.
    uint public maxLiquidationPeriod = 2 years;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the 
    // liquidation timestamp is in the past.
    uint public liquidationTimestamp = ~uint(0);

    // Constructor
    function CollateralisedNomin(address _owner, address _oracle,
                                 address _beneficiary, uint initialEtherPrice) public
    {
        owner = _owner;
        oracle = _oracle;
        beneficiary = _beneficiary;
        etherPrice = initialEtherPrice;
        lastPriceUpdate = now;
    }

    // Throw an exception if the caller is not the contract's owner.
    modifier onlyOwner
    {
        require(msg.sender == owner);
        _;
    }

    // Throw an exception if the caller is not the contract's designated price oracle.
    modifier onlyOracle
    {
        require(msg.sender == oracle);
        _;
    }

    // Throw an exception if the contract is not currently undertaking liquidation.
    modifier notLiquidating
    {
        require(!isLiquidating());
        _;
    }

    modifier priceNotStale
    {
        require(!priceIsStale());
        _;
    }
    
    // Set the owner of this contract. Only the contract owner should be able to call this.
    function setOwner(address newOwner)
        public
        onlyOwner
    {
        owner = newOwner;
    }   
    
    // Set the price oracle of this contract. Only the contract owner should be able to call this.
    function setOracle(address newOracle)
        public
        onlyOwner
    {
        oracle = newOracle;
    }
    
    // Set the beneficiary of this contract. Only the contract owner should be able to call this.
    function setBeneficiary(address newBeneficiary)
        public
        onlyOwner
    {
        beneficiary = newBeneficiary;
    }
    
    /* Return the equivalent usd value of the given quantity
     * of ether at the current price.
     * Exceptional conditions:
     *     Price is stale. */
    function usdValue(uint eth)
        public
        constant
        priceNotStale
        returns (uint)
    {
        return mul(eth, etherPrice);
    }
    
    /* Return the current USD value of the contract's balance. 
     * Exceptional conditions:
     *     Price is stale. */
    function usdBalance()
        public
        constant
        returns (uint)
    {
        // Price staleness check occurs inside the call to usdValue.
        return usdValue(this.balance);
    }
    
    /* Return the equivalent ether value of the given quantity
     * of usd at the current price.
     * Exceptional conditions:
     *     Price is stale. */
    function etherValue(uint usd)
        public
        constant
        priceNotStale
        returns (uint)
    {
        return div(usd, etherPrice);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of ether.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     Insufficient backing funds provided (less than US$n worth of ether).
     *     Price is stale. */
    function issue(uint n)
        public
        onlyOwner
        payable
    {
        // Price staleness check occurs inside the call to usdValue.
        require(usdValue(msg.value) >= n);
        supply = add(supply, n);
        pool = add(pool, n);
        Issuance(n, msg.value);
    }

    /* Burns n nomins from the pool, and withdraws the specified
     * quantity of ether, sending it to the beneficiary address.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     There are at least n nomins in the pool.
     *     Remaining collateral is less than 2*(supply - pool) USD worth of ether;
     *       each nomin in circulation is overcollateralised at least 2x.
     *     Price is stale. */
    function burn(uint n, uint eth)
        public
        onlyOwner
    {
        // Price staleness check occurs inside the call to usdValue.
        require(pool >= n &&
                usdValue(sub(this.balance, eth)) >= 2*(supply - pool));
        pool = sub(pool, n);
        supply = sub(supply, n);
        beneficiary.transfer(usdValue(eth));
        Burning(n, eth);
    }

    /* Sends n nomins to the sender from the pool, in exchange for
     * $n plus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient funds provided.
     *     More nomins requested than are in the pool.
     *     n below the purchase minimum (1 cent).
     *     contract in liquidation.
     *     Price is stale. */
    function buy(uint n)
        public
        notLiquidating
        payable
    {
        // Price staleness check occurs inside the call to purchaseEtherCost.
        require(n >= purchaseMininum &&
                msg.value >= purchaseCostEther(n);
        // sub requires that pool >= n
        pool = sub(pool, n);
        balances[msg.sender] = balances[msg.sender] + n;
        Purchase(msg.sender, n, msg.value);
    }
    
    /* Return the USD cost (including fee) of purchasing n nomins */
    function purchaseCostUSD(uint n)
        public
        constant
        returns (uint)
    {
        return mul(n, add(UNIT, fee))
    }

    /* Return the ether cost (including fee) of purchasing n nomins.
     * Exceptional conditions:
     *     Price is stale. */
    function purchaseCostEther(uint n)
        public
        constant
        returns (uint)
    {
        // Price staleness check occurs inside the call to etherValue.
        return etherValue(purchaseCostUSD(n));
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet.
     *     Insufficient funds in the pool to pay sender.
     *     Price is stale. */
    function sell(uint n)
        public
    {
        uint proceeds = saleProceedsUSD(n);
        // Price staleness check occurs inside the call to usdBalance
        require(usdBalance() >= proceeds);
        // sub requires that the balance is greater than n
        balances[msg.sender] = sub(balances[msg.sender], n);
        pool = add(pool, n);
        msg.sender.transfer(proceeds);
        Sale(msg.sender, n, proceeds);
    }
    
    /* Return the USD proceeds (less the fee) of selling n nomins.*/
    function saleProceedsUSD(uint n)
        public
        constant
        returns (uint)
    {
        return mul(n, sub(UNIT, fee));
    }

    /* Return the ether proceeds (less the fee) of selling n
     * nomins.
     * Exceptional conditions:
     *     Price is stale. */
    function saleProceedsEther(uint n)
        public
        constant
        returns (uint)
    {
        // Price staleness check occurs inside the call to etherValue.
        return etherValue(saleProceedsUSD(n));
    }

    /* Update the current ether price and update the last updated time,
     * refreshing the price staleness.
     * Exceptional conditions:
     *     Not called by the oracle. */
    function setPrice(uint price)
        public
        onlyOracle
    {
        etherPrice = price;
        lastPriceUpdate = now;
        PriceUpdate(price);
    }

    /* Update the period after which the price will be considered stale.
     * Exceptional conditions:
     *     Not called by the owner. */
    function setStalePeriod(uint period)
        public
        onlyOwner
    {
        stalePeriod = period;
        StalePeriodUpdate(price);
    }

    /* True iff the current block timestamp is later than the time
     * the price was last updated, plus the stale period. */
    function priceIsStale()
        public
        returns (bool)
    {
        return lastPriceUpdate + stalePeriod < now;
    }

    /* Lock nomin purchase function in preparation for destroying the contract.
     * While the contract is under liquidation, users may sell nomins back to the system.
     * After liquidation period has terminated, the contract may be self-destructed,
     * returning all remaining ether to the beneficiary address.
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
        Liquidation();
    }

    /* Extend the liquidation period. It may only get longer,
     * not shorter, and it may not be extended past the liquidation max. */
    function extendLiquidationPeriod(uint extension)
        public
        onlyOwner
    {
        require(liquidationPeriod + extension <= maxLiquidationPeriod);
        liquidationPeriod += extension;
        LiquidationExtended(extension);
    }
    
    /* True iff the liquidation block is earlier than the current block.*/
    function isLiquidating()
        public
        constant
        returns (bool)
    {
        return liquidationTimestamp <= now;
    }
    
    /* Destroy this contract, returning all funds back to the beneficiary
     * wallet, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod blocks, or there 
     * Exceptional cases:
     *     Not called by contract owner.
     *     Contract is not in liquidation.
     *     Contract has not been in liquidation for at least liquidationPeriod.
     */
    function selfDestruct()
        public
        onlyOwner
    {
        require(isLiquidating() &&
                liquidationTimestamp + liquidationPeriod < now);
        SelfDestructed();
        selfdestruct(beneficiary);
    }

    /* Emitted whenever new nomins are issued into the pool. */
    event Issuance(uint nominsIssued, uint collateralDeposited);

    /* Emitted whenever nomins in the pool are destroyed. */
    event Burning(uint nominsBurned, uint collateralWithdrawn);

    /* Emitted whenever a purchase of nomins is made, and how many eth were provided to buy them. */
    event Purchase(address buyer, uint nomins, uint eth);

    /* Emitted whenever a sale of nomins is made, and how many eth they were sold for. */
    event Sale(address seller, uint nomins, uint eth);

    /* Emitted whenever setPrice() is called by the oracle to update the price. */
    event PriceUpdate(uint newPrice);

    /* Emitted whenever setStalePeriod() is called by the owner. */
    event StalePeriodUpdate(uint newPeriod);

    /* Emitted whenever liquidation is initiated. */
    event Liquidation();

    /* Emitted whenever liquidation is extended. */
    event LiquidationExtended(uint extension);

    /* Emitted when the contract self-destructs. */
    event SelfDestructed();
}
