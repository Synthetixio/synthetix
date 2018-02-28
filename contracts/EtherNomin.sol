/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       EtherNomin.sol
version:    0.3
author:     Anton Jurisevic
            Mike Spain

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

pragma solidity ^0.4.20;


import "contracts/ExternStateProxyFeeToken.sol";
import "contracts/FeeTokenState.sol";
import "contracts/Court.sol";


contract EtherNomin is ExternStateProxyFeeToken {

    /* ========== STATE VARIABLES ========== */

    // The oracle provides price information to this contract.
    // It may only call the updatePrice() function.
    address public oracle;

    // The address of the contract which manages confiscation votes.
    Court public court;

    // Foundation wallet for funds to go to post liquidation.
    address public beneficiary;

    // Nomins in the pool ready to be sold.
    uint public nominPool_dec;

    // Impose a 50 basis-point fee for buying from and selling to the nomin pool.
    uint public poolFeeRate_dec = UNIT / 200;

    // The minimum purchasable quantity of nomins is 1 cent.
    uint constant MINIMUM_PURCHASE_dec = UNIT / 100;

    // When issuing, nomins must be overcollateralised by this ratio.
    uint constant MINIMUM_ISSUANCE_RATIO_dec =  2 * UNIT;

    // If the collateralisation ratio of the contract falls below this level,
    // immediately begin liquidation.
    uint constant AUTO_LIQUIDATION_RATIO_dec = UNIT;

    // The liquidation period is the duration that must pass before the liquidation period is complete.
    // It can be extended up to a given duration.
    uint constant DEFAULT_LIQUIDATION_PERIOD = 90 days;
    uint constant MAX_LIQUIDATION_PERIOD = 180 days;
    uint public liquidationPeriod = DEFAULT_LIQUIDATION_PERIOD;

    // The timestamp when liquidation was activated. We initialise this to
    // uint max, so that we know that we are under liquidation if the
    // liquidation timestamp is in the past.
    uint public liquidationTimestamp = ~uint(0);

    // Ether price from oracle (fiat per ether).
    uint public etherPrice_dec;

    // Last time the price was updated.
    uint public lastPriceUpdate;

    // The period it takes for the price to be considered stale.
    // If the price is stale, functions that require the price are disabled.
    uint public stalePeriod = 2 days;


    /* ========== CONSTRUCTOR ========== */

    function EtherNomin(address _havven, address _oracle,
                        address _beneficiary,
                        uint initialEtherPrice_dec,
                        address _owner, FeeTokenState initialState)
        ExternStateProxyFeeToken("Ether-Backed USD Nomins", "eUSD",
                      _owner,
                      15 * UNIT / 10000, // nomin transfers incur a 15 bp fee
                      _havven, // havven contract is the fee authority
                      initialState, // Construct a new state_owner
                      _owner)
        public
    {
        oracle = _oracle;
        beneficiary = _beneficiary;

        etherPrice_dec = initialEtherPrice_dec;
        lastPriceUpdate = now;
        PriceUpdated(etherPrice_dec);

        state.setFrozen(this, true);
    }


    /* ========== SETTERS ========== */

    function setOracle(address _oracle)
        optionalProxy_onlyOwner
    {
        oracle = _oracle;
        OracleUpdated(_oracle);
    }

    function setCourt(Court _court)
        external
        optionalProxy_onlyOwner
    {
        court = _court;
        CourtUpdated(_court);
    }

    function setBeneficiary(address _beneficiary)
        external
        optionalProxy_onlyOwner
    {
        beneficiary = _beneficiary;
        BeneficiaryUpdated(_beneficiary);
    }

    function setPoolFeeRate(uint _poolFeeRate_dec)
        optionalProxy_onlyOwner
    {
        require(_poolFeeRate_dec <= UNIT);
        poolFeeRate_dec = _poolFeeRate_dec;
        PoolFeeRateUpdated(_poolFeeRate_dec);
    }

    function setStalePeriod(uint _stalePeriod)
        external
        optionalProxy_onlyOwner
    {
        stalePeriod = _stalePeriod;
        StalePeriodUpdated(_stalePeriod);
    }

    function setFrozen(address account, bool value)
        internal
    {
        state.setFrozen(account, value);
    }

    /* ========== VIEW FUNCTIONS ========== */

    /* Return the equivalent fiat value of the given quantity
     * of ether at the current price.
     * Reverts if the price is stale. */
    function fiatValue(uint ether_dec)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeDecMul(ether_dec, etherPrice_dec);
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
    function etherValue(uint fiat_dec)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeDecDiv(fiat_dec, etherPrice_dec);
    }

    /* The same as etherValue(), but without the stale price check. */
    function etherValueAllowStale(uint fiat_dec) 
        internal
        view
        returns (uint)
    {
        return safeDecDiv(fiat_dec, etherPrice_dec);
    }

    /* Return the units of fiat per nomin in the supply.
     * Reverts if the price is stale. */
    function collateralisationRatio()
        public
        view
        returns (uint)
    {
        return safeDecDiv(fiatBalance(), state.totalSupply());
    }

    /* Return the fee charged on a purchase or sale of n nomins. */
    function poolFeeIncurred(uint n)
        public
        view
        returns (uint)
    {
        return safeDecMul(n, poolFeeRate_dec);
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
            bool allTokensReturned = (liquidationTimestamp + 1 weeks < now) && (nominPool_dec == state.totalSupply());
            return totalPeriodElapsed || allTokensReturned;
        }
        return false;
    }

    
    function isFrozen(address account) 
        public
        view
        returns (bool)
    {
        return state.isFrozen(account);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Override ERC20 transfer function in order to check
     * whether the recipient account is frozen. Note that there is
     * no need to check whether the sender has a frozen account,
     * since their funds have already been confiscated,
     * and no new funds can be transferred to it.*/
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        require(!state.isFrozen(to));
        return transfer_byProxy(to, value);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(!state.isFrozen(to));
        return super.transferFrom(from, to, value);
    }

    /* Update the current ether price and update the last updated time,
     * refreshing the price staleness.
     * Also checks whether the contract's collateral levels have fallen to low,
     * and initiates liquidation if that is the case.
     * Exceptional conditions:
     *     Not called by the oracle.
     *     Not the most recently sent price. */
    function updatePrice(uint price, uint timeSent)
        external
        postCheckAutoLiquidate
    {
        // Should be callable only by the oracle.
        require(msg.sender == oracle);
        // Must be the most recently sent price, but not too far in the future.
        // (so we can't lock ourselves out of updating the oracle for longer than this)
        require(lastPriceUpdate < timeSent && timeSent < now + 10 minutes);

        etherPrice_dec = price;
        lastPriceUpdate = timeSent;
        PriceUpdated(price);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of ether.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     Insufficient backing funds provided (post-issuance collateralisation below minimum requirement).
     *     Price is stale. */
    function issue(uint n)
        external
        payable
        notLiquidating
        optionalProxy_onlyOwner
    {
        // Price staleness check occurs inside the call to fiatValue.
        // Safe additions are unnecessary here, as either the addition is checked on the following line
        // or the overflow would cause the requirement not to be satisfied.
        uint sum = safeAdd(state.totalSupply(), n);
        require(fiatBalance() >= safeDecMul(sum, MINIMUM_ISSUANCE_RATIO_dec));
        state.setTotalSupply(sum);
        nominPool_dec = safeAdd(nominPool_dec, n);
        Issuance(n, msg.value);
    }

    /* Burns n nomins from the pool.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     There are fewer than n nomins in the pool. */
    function burn(uint n)
        external
        optionalProxy_onlyOwner
    {
        // Require that there are enough nomins in the accessible pool to burn
        require(nominPool_dec >= n);
        nominPool_dec = safeSub(nominPool_dec, n);
        state.setTotalSupply(safeSub(state.totalSupply(), n));
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
        external
        payable
        notLiquidating
        optionalProxy
    {
        // Price staleness check occurs inside the call to purchaseEtherCost.
        require(n >= MINIMUM_PURCHASE_dec &&
                msg.value == purchaseCostEther(n));
        address sender = messageSender;
        // sub requires that nominPool_dec >= n
        nominPool_dec = safeSub(nominPool_dec, n);
        state.setBalance(sender, safeAdd(state.balanceOf(sender), n));
        Purchase(sender, sender, n, msg.value);
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet.
     *     Insufficient funds in the pool to pay sender.
     *     Price is stale if not in liquidation. */
    function sell(uint n)
        external
        optionalProxy
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

        address sender = messageSender;
        // sub requires that the balance is greater than n
        state.setBalance(sender, safeSub(state.balanceOf(sender), n));
        nominPool_dec = safeAdd(nominPool_dec, n);
        Sale(sender, sender, n, proceeds);
        sender.transfer(proceeds);
    }

    /* Lock nomin purchase function in preparation for destroying the contract.
     * While the contract is under liquidation, users may sell nomins back to the system.
     * After liquidation period has terminated, the contract may be self-destructed,
     * returning all remaining ether to the beneficiary address.
     * Exceptional cases:
     *     Not called by contract owner;
     *     contract already in liquidation; */
    function forceLiquidation()
        external
        notLiquidating
        optionalProxy_onlyOwner
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
        external
        optionalProxy_onlyOwner
    {
        require(isLiquidating());
        uint sum = safeAdd(liquidationPeriod, extension);
        require(sum <= MAX_LIQUIDATION_PERIOD);
        liquidationPeriod = sum;
        LiquidationExtended(extension);
    }

    /* Liquidation can only be stopped if the collateralisation ratio
     * of this contract has recovered above the automatic liquidation
     * threshold, for example if the ether price has increased,
     * or by including enough ether in this transaction. */
    function terminateLiquidation()
        external
        payable
        priceNotStale
        optionalProxy_onlyOwner
    {
        require(isLiquidating());
        require(state.totalSupply() == 0 || collateralisationRatio() >= AUTO_LIQUIDATION_RATIO_dec);
        liquidationTimestamp = ~uint(0);
        liquidationPeriod = DEFAULT_LIQUIDATION_PERIOD;
        LiquidationTerminated();
    }

    /* The owner may destroy this contract, returning all funds back to the beneficiary
     * wallet, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod, or all circulating
     * nomins have been sold back into the pool. */
    function selfDestruct()
        external
        optionalProxy_onlyOwner
    {
        require(canSelfDestruct());
        SelfDestructed();
        selfdestruct(beneficiary);
    }

    /* If a confiscation court motion has passed and reached the confirmation
     * state, the court may transfer the target account's balance to the fee pool
     * and freeze its participation in further transactions. */
    function confiscateBalance(address target)
        external
    {
        // Should be callable only by the confiscation court.
        require(Court(msg.sender) == court);
        
        // A motion must actually be underway.
        uint motionID = court.targetMotionID(target);
        require(motionID != 0);

        // These checks are strictly unnecessary,
        // since they are already checked in the court contract itself.
        // I leave them in out of paranoia.
        require(court.motionConfirming(motionID));
        require(court.motionPasses(motionID));
        require(!state.isFrozen(target));

        // Confiscate the balance in the account and freeze it.
        uint balance = state.balanceOf(target);
        state.setFeePool(safeAdd(state.feePool(), balance));
        state.setBalance(target, 0);
        state.setFrozen(target, true);
        Confiscation(target, target, balance);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        external
        optionalProxy_onlyOwner
    {
        if (state.isFrozen(target) && EtherNomin(target) != this) {
            state.setFrozen(target, false);
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
        if (!isLiquidating() && state.totalSupply() != 0 && collateralisationRatio() < AUTO_LIQUIDATION_RATIO_dec) {
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
