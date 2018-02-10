/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       EtherNomin.sol
version:    0.3
author:     Anton Jurisevic

date:       2018-2-6

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Ether-backed nomin stablecoin contract.

This contract issues nomins, which are tokens worth 1 USD each. They are backed
by a pool of ether collateral, so that if a user has nomins, they may
redeem them for ether from the pool, or if they want to obtain nomins,
they may pay ether into the pool in order to do so.

The supply of nomins that may be in circulation at any time is limited.
The contract owner may increase this quantity, but only if they provide
ether to back it. The backing the owner provides at issuance must
keep each nomin at least twice overcollateralised.
The owner may also destroy nomins in the pool, which is potential avenue
by which to maintain healthy collateralisation levels, as it reduces
supply without withdrawing ether collateral.

A configurable fee is charged on nomin transfers and deposited
into a common pot, which havven holders may withdraw from once per
fee period.

Ether price is continually updated by an external oracle, and the value
of the backing is computed on this basis. To ensure the integrity of
this system, if the contract's price has not been updated recently enough,
it will temporarily disable itself until it receives more price information.

The contract owner may at any time initiate contract liquidation.
During the liquidation period, most contract functions will be deactivated.
No new nomins may be issued or bought, but users may sell nomins back
to the system.
If the system's collateral falls below a specified level, then anyone
may initiate liquidation.

After the liquidation period has elapsed, which is initially 90 days,
the owner may destroy the contract, transferring any remaining collateral
to a nominated beneficiary address.
This liquidation period may be extended up to a maximum of 180 days.
If the contract is recollateralised, the owner may terminate liquidation.

-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/ERC20FeeToken.sol";
import "contracts/Havven.sol";
import "contracts/Court.sol";


contract EtherNomin is ERC20FeeToken {

    /* ========== STATE VARIABLES ========== */

    // The oracle provides price information to this contract.
    // It may only call the updatePrice() function.
    address public oracle;

    // The address of the contract which manages confiscation votes.
    Court public court;

    // Foundation wallet for funds to go to post liquidation.
    address public beneficiary;

    // Nomins in the pool ready to be sold.
    uint public nominPool = 0;

    // Impose a 50 basis-point fee for buying from and selling to the nomin pool.
    uint public poolFeeRate = UNIT / 200;

    // The minimum purchasable quantity of nomins is 1 cent.
    uint constant purchaseMininum = UNIT / 100;

    // When issuing, nomins must be overcollateralised by this ratio.
    uint constant collatRatioMinimum =  2 * UNIT;

    // If the collateralisation ratio of the contract falls below this level,
    // immediately begin liquidation.
    uint constant autoLiquidationRatio = UNIT;

    // The liquidation period is the duration that must pass before the liquidation period is complete.
    // It can be extended up to a given duration.
    uint constant defaultLiquidationPeriod = 90 days;
    uint constant maxLiquidationPeriod = 180 days;
    uint public liquidationPeriod = defaultLiquidationPeriod;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the
    // liquidation timestamp is in the past.
    uint public liquidationTimestamp = ~uint(0);

    // Ether price from oracle (fiat per ether).
    uint public etherPrice;

    // Last time the price was updated.
    uint public lastPriceUpdate;

    // The period it takes for the price to be considered stale.
    // If the price is stale, functions that require the price are disabled.
    uint public stalePeriod = 2 days;

    // The set of addresses that have been frozen by confiscation.
    mapping(address => bool) public isFrozen;


    /* ========== CONSTRUCTOR ========== */

    function EtherNomin(Havven _havven, address _oracle,
                        address _beneficiary,
                        uint initialEtherPrice,
                        address _owner)
        ERC20FeeToken("Ether-Backed USD Nomins", "eUSD",
                      0, _owner,
                      15 * UNIT / 10000, // nomin transfers incur a 15 bp fee
                      address(_havven), // havven contract is the fee authority
                      _owner)
        public
    {
        oracle = _oracle;
        beneficiary = _beneficiary;

        etherPrice = initialEtherPrice;
        lastPriceUpdate = now;
        PriceUpdated(etherPrice);

        isFrozen[this] = true;
    }


    /* ========== SETTERS ========== */

    function setOracle(address newOracle)
        public
        onlyOwner
    {
        oracle = newOracle;
        OracleUpdated(newOracle);
    }

    function setCourt(address newCourt)
        public
        onlyOwner
    {
        court = Court(newCourt);
        CourtUpdated(newCourt);
    }

    function setBeneficiary(address newBeneficiary)
        public
        onlyOwner
    {
        beneficiary = newBeneficiary;
        BeneficiaryUpdated(newBeneficiary);
    }

    function setPoolFeeRate(uint newFeeRate)
        public
        onlyOwner
    {
        require(newFeeRate <= UNIT);
        poolFeeRate = newFeeRate;
        PoolFeeRateUpdated(newFeeRate);
    }

    function setStalePeriod(uint period)
        public
        onlyOwner
    {
        stalePeriod = period;
        StalePeriodUpdated(period);
    }

    /* ========== VIEW FUNCTIONS ========== */

    /* Return the equivalent fiat value of the given quantity
     * of ether at the current price.
     * Reverts if the price is stale. */
    function fiatValue(uint eth)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeDecMul(eth, etherPrice);
    }

    /* Return the current fiat value of the contract's balance.
     * Reverts if the price is stale. */
    function fiatBalance()
        public
        view
        returns (uint)
    {
        // Price staleness check occurs inside the call to fiatValue.
        return fiatValue(this.balance);
    }

    /* Return the equivalent ether value of the given quantity
     * of fiat at the current price.
     * Reverts if the price is stale. */
    function etherValue(uint fiat)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeDecDiv(fiat, etherPrice);
    }

    /* The same as etherValue(), but without the stale price check. */
    function etherValueAllowStale(uint fiat) 
        internal
        view
        returns (uint)
    {
        return safeDecDiv(fiat, etherPrice);
    }

    /* Return the units of fiat per nomin in the supply.
     * Reverts if the price is stale. */
    function collateralisationRatio()
        public
        view
        returns (uint)
    {
        return safeDecDiv(fiatBalance(), totalSupply);
    }

    /* Return the fee charged on a purchase or sale of n nomins. */
    function poolFeeIncurred(uint n)
        public
        view
        returns (uint)
    {
        return safeDecMul(n, poolFeeRate);
    }

    /* Return the fiat cost (including fee) of purchasing n nomins.
     * Nomins are purchased for $1, plus the fee. */
    function purchaseCostFiat(uint n)
        public
        view
        returns (uint)
    {
        return safeAdd(n, poolFeeIncurred(n));
    }

    /* Return the ether cost (including fee) of purchasing n nomins.
     * Reverts if the price is stale. */
    function purchaseCostEther(uint n)
        public
        view
        returns (uint)
    {
        // Price staleness check occurs inside the call to etherValue.
        return etherValue(purchaseCostFiat(n));
    }

    /* Return the fiat proceeds (less the fee) of selling n nomins.
     * Nomins are sold for $1, minus the fee. */
    function saleProceedsFiat(uint n)
        public
        view
        returns (uint)
    {
        return safeSub(n, poolFeeIncurred(n));
    }

    /* Return the ether proceeds (less the fee) of selling n
     * nomins.
     * Reverts if the price is stale. */
    function saleProceedsEther(uint n)
        public
        view
        returns (uint)
    {
        // Price staleness check occurs inside the call to etherValue.
        return etherValue(saleProceedsFiat(n));
    }

    /* The same as saleProceedsEther(), but without the stale price check. */
    function saleProceedsEtherAllowStale(uint n)
        internal
        view
        returns (uint)
    {
        return etherValueAllowStale(saleProceedsFiat(n));
    }

    /* True iff the current block timestamp is later than the time
     * the price was last updated, plus the stale period. */
    function priceIsStale()
        public
        view
        returns (bool)
    {
        return safeAdd(lastPriceUpdate, stalePeriod) < now;
    }

    function isLiquidating()
        public
        view
        returns (bool)
    {
        return liquidationTimestamp <= now;
    }

    /* True if the contract is self-destructible. 
     * This is true if either the complete liquidation period has elapsed,
     * or if all tokens have been returned to the contract and it has been
     * in liquidation for at least a week.
     * Since the contract is only destructible after the liquidationTimestamp,
     * a fortiori canSelfDestruct() implies isLiquidating(). */
    function canSelfDestruct()
        public
        view
        returns (bool)
    {
        // Not being in liquidation implies the timestamp is uint max, so it would roll over.
        // We need to check whether we're in liquidation first.
        if (isLiquidating()) {
            // These timestamps and durations have values clamped within reasonable values and
            // cannot overflow.
            bool totalPeriodElapsed = liquidationTimestamp + liquidationPeriod < now;
            bool allTokensReturned = (liquidationTimestamp + 1 weeks < now) && (nominPool == totalSupply);
            return totalPeriodElapsed || allTokensReturned;
        }
        return false;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Override ERC20 transfer function in order to check
     * whether the sender or recipient account is frozen. */
    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        require(!(isFrozen[msg.sender] || isFrozen[_to]));
        return super.transfer(_to, _value);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the sender or recipient account is frozen. */
    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        require(!(isFrozen[_from] || isFrozen[_to]));
        return super.transferFrom(_from, _to, _value);
    }

    /* Update the current ether price and update the last updated time,
     * refreshing the price staleness.
     * Also checks whether the contract's collateral levels have fallen to low,
     * and initiates liquidation if that is the case.
     * Exceptional conditions:
     *     Not called by the oracle. */
    function updatePrice(uint price)
        public
        postCheckAutoLiquidate
    {
        // Should be callable only by the oracle.
        require(msg.sender == oracle);

        etherPrice = price;
        lastPriceUpdate = now;
        PriceUpdated(price);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of ether.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     Insufficient backing funds provided (post-issuance collateralisation below minimum requirement).
     *     Price is stale. */
    function issue(uint n)
        public
        onlyOwner
        payable
        notLiquidating
    {
        // Price staleness check occurs inside the call to fiatValue.
        // Safe additions are unnecessary here, as either the addition is checked on the following line
        // or the overflow would cause the requirement not to be satisfied.
        uint sum = safeAdd(totalSupply, n);
        require(fiatBalance() >= safeDecMul(sum, collatRatioMinimum));
        totalSupply = sum;
        nominPool = safeAdd(nominPool, n);
        Issuance(n, msg.value);
    }

    /* Burns n nomins from the pool.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     There are fewer than n nomins in the pool. */
    function burn(uint n)
        public
        onlyOwner
    {
        // Require that there are enough nomins in the accessible pool to burn
        require(nominPool >= n);
        nominPool = safeSub(nominPool, n);
        totalSupply = safeSub(totalSupply, n);
        Burning(n);
    }

    /* Sends n nomins to the sender from the pool, in exchange for
     * $n plus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient or too many funds provided.
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
                msg.value == purchaseCostEther(n));
        // sub requires that nominPool >= n
        nominPool = safeSub(nominPool, n);
        balanceOf[msg.sender] = safeAdd(balanceOf[msg.sender], n);
        Purchase(msg.sender, msg.sender, n, msg.value);
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet.
     *     Insufficient funds in the pool to pay sender.
     *     Price is stale if not in liquidation. */
    function sell(uint n)
        public
    {

        // Price staleness check occurs inside the call to saleProceedsEther,
        // but we allow people to sell their nomins back to the system
        // if we're in liquidation, regardless.
        uint proceeds;
        if (isLiquidating()) {
            proceeds = saleProceedsEtherAllowStale(n);
        } else {
            proceeds = saleProceedsEther(n);
        }

        require(this.balance >= proceeds);

        // sub requires that the balance is greater than n
        balanceOf[msg.sender] = safeSub(balanceOf[msg.sender], n);
        nominPool = safeAdd(nominPool, n);
        Sale(msg.sender, msg.sender, n, proceeds);
        msg.sender.transfer(proceeds);
    }

    /* Lock nomin purchase function in preparation for destroying the contract.
     * While the contract is under liquidation, users may sell nomins back to the system.
     * After liquidation period has terminated, the contract may be self-destructed,
     * returning all remaining ether to the beneficiary address.
     * Exceptional cases:
     *     Not called by contract owner;
     *     contract already in liquidation; */
    function forceLiquidation()
        public
        onlyOwner
        notLiquidating
    {
        beginLiquidation();
    }

    function beginLiquidation()
        internal
    {
        liquidationTimestamp = now;
        Liquidation(liquidationPeriod);
    }

    /* If the contract is liquidating, the owner may extend the liquidation period.
     * It may only get longer, not shorter, and it may not be extended past
     * the liquidation max. */
    function extendLiquidationPeriod(uint extension)
        public
        onlyOwner
    {
        require(isLiquidating());
        uint sum = safeAdd(liquidationPeriod, extension);
        require(sum <= maxLiquidationPeriod);
        liquidationPeriod = sum;
        LiquidationExtended(extension);
    }

    /* Liquidation can only be stopped if the collateralisation ratio
     * of this contract has recovered above the automatic liquidation
     * threshold, for example if the ether price has increased,
     * or by including enough ether in this transaction. */
    function terminateLiquidation()
        public
        onlyOwner
        priceNotStale
        payable
    {
        require(isLiquidating());
        require(totalSupply == 0 || collateralisationRatio() >= autoLiquidationRatio);
        liquidationTimestamp = ~uint(0);
        liquidationPeriod = defaultLiquidationPeriod;
        LiquidationTerminated();
    }

    /* The owner may destroy this contract, returning all funds back to the beneficiary
     * wallet, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod, or all circulating
     * nomins have been sold back into the pool. */
    function selfDestruct()
        public
        onlyOwner
    {
        require(canSelfDestruct());
        SelfDestructed();
        selfdestruct(beneficiary);
    }

    /* If a confiscation court vote has passed and reached the confirmation
     * state, the court may transfer the target account's balance to the fee pool
     * and freeze its participation in further transactions. */
    function confiscateBalance(address target)
        public
    {
        // Should be callable only by the confiscation court.
        require(Court(msg.sender) == court);

        // These checks are strictly unnecessary,
        // since they are already checked in the court contract itself.
        // I leave them in out of paranoia.
        require(court.confirming(target));
        require(court.votePasses(target));

        // Confiscate the balance in the account and freeze it.
        uint balance = balanceOf[target];
        feePool = safeAdd(feePool, balance);
        balanceOf[target] = 0;
        isFrozen[target] = true;
        Confiscation(target, target, balance);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        public
        onlyOwner
    {
        if (isFrozen[target] && EtherNomin(target) != this) {
            isFrozen[target] = false;
            AccountUnfrozen(target, target);
        }
    }

    /* Fallback function allows convenient collateralisation of the contract,
     * including by non-foundation parties. */
    function() public payable {}


    /* ========== MODIFIERS ========== */

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

    /* Any function modified by this will automatically liquidate
     * the system if the collateral levels are too low.
     * This is called on collateral-value/nomin-supply modifying functions that can
     * actually move the contract into liquidation. This is really only
     * the price update, since issuance requires that the contract is overcollateralised,
     * burning can only destroy tokens without withdrawing backing, buying from the pool can only
     * asymptote to a collateralisation level of unity, while selling into the pool can only 
     * increase the collateralisation ratio.
     * Additionally, price update checks should/will occur frequently. */
    modifier postCheckAutoLiquidate
    {
        _;
        if (!isLiquidating() && totalSupply != 0 && collateralisationRatio() < autoLiquidationRatio) {
            beginLiquidation();
        }
    }


    /* ========== EVENTS ========== */

    event Issuance(uint nominsIssued, uint collateralDeposited);

    event Burning(uint nominsBurned);

    event Purchase(address buyer, address indexed buyerIndex, uint nomins, uint eth);

    event Sale(address seller, address indexed sellerIndex, uint nomins, uint eth);

    event PriceUpdated(uint newPrice);

    event StalePeriodUpdated(uint newPeriod);

    event OracleUpdated(address newOracle);

    event CourtUpdated(address newCourt);

    event BeneficiaryUpdated(address newBeneficiary);

    event Liquidation(uint duration);

    event LiquidationTerminated();

    event LiquidationExtended(uint extension);

    event PoolFeeRateUpdated(uint newFeeRate);

    event SelfDestructed();

    event Confiscation(address target, address indexed targetIndex, uint balance);

    event AccountUnfrozen(address target, address indexed targetIndex);
}
