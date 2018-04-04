/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       EtherNomin.sol
version:    1.0
author:     Anton Jurisevic
            Mike Spain

date:       2018-2-28

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

pragma solidity 0.4.21;


import "contracts/ExternStateFeeToken.sol";
import "contracts/TokenState.sol";
import "contracts/Court.sol";


contract EtherNomin is ExternStateFeeToken {

    /* ========== STATE VARIABLES ========== */

    // The oracle provides price information to this contract.
    // It may only call the updatePrice() function.
    address public oracle;

    // The address of the contract which manages confiscation votes.
    Court public court;

    // Foundation wallet for funds to go to post liquidation.
    address public beneficiary;

    // Nomins in the pool ready to be sold.
    uint public nominPool;

    // Impose a 50 basis-point fee for buying from and selling to the nomin pool.
    uint public poolFeeRate = UNIT / 200;

    // The minimum purchasable quantity of nomins is 1 cent.
    uint constant MINIMUM_PURCHASE = UNIT / 100;

    // When issuing, nomins must be overcollateralised by this ratio.
    uint constant MINIMUM_ISSUANCE_RATIO =  2 * UNIT;

    // If the collateralisation ratio of the contract falls below this level,
    // immediately begin liquidation.
    uint constant AUTO_LIQUIDATION_RATIO = UNIT;

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
    uint public etherPrice;

    // Last time the price was updated.
    uint public lastPriceUpdateTime;

    // The period it takes for the price to be considered stale.
    // If the price is stale, functions that require the price are disabled.
    uint public stalePeriod = 30 minutes;

    // Accounts which have lost the privilege to transact in nomins.
    mapping(address => bool) public frozen;


    /* ========== CONSTRUCTOR ========== */

    function EtherNomin(address _havven, address _oracle,
                        address _beneficiary,
                        uint _initialEtherPrice,
                        address _owner, TokenState _initialState)
        ExternStateFeeToken("Ether-Backed USD Nomins", "eUSD",
                            15 * UNIT / 10000, // nomin transfers incur a 15 bp fee
                            _havven, // the havven contract is the fee authority
                            _initialState,
                            _owner)
        public
    {
        oracle = _oracle;
        beneficiary = _beneficiary;

        etherPrice = _initialEtherPrice;
        lastPriceUpdateTime = now;
        emit PriceUpdated(_initialEtherPrice);

        // It should not be possible to transfer to the nomin contract itself.
        frozen[this] = true;
    }


    /* ========== FALLBACK FUNCTION ========== */

    /* Fallback function allows convenient collateralisation of the contract,
     * including by non-foundation parties. */
    function() public payable {}


    /* ========== SETTERS ========== */

    function setOracle(address _oracle)
        external
        onlyOwner
    {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setCourt(Court _court)
        external
        onlyOwner
    {
        court = _court;
        emit CourtUpdated(_court);
    }

    function setBeneficiary(address _beneficiary)
        external
        onlyOwner
    {
        beneficiary = _beneficiary;
        emit BeneficiaryUpdated(_beneficiary);
    }

    function setPoolFeeRate(uint _poolFeeRate)
        external
        onlyOwner
    {
        require(_poolFeeRate <= UNIT);
        poolFeeRate = _poolFeeRate;
        emit PoolFeeRateUpdated(_poolFeeRate);
    }

    function setStalePeriod(uint _stalePeriod)
        external
        onlyOwner
    {
        stalePeriod = _stalePeriod;
        emit StalePeriodUpdated(_stalePeriod);
    }
 

    /* ========== VIEW FUNCTIONS ========== */ 

    /* Return the equivalent fiat value of the given quantity
     * of ether at the current price.
     * Reverts if the price is stale. */
    function fiatValue(uint etherWei)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeMul_dec(etherWei, etherPrice);
    }

    /* Return the current fiat value of the contract's balance.
     * Reverts if the price is stale. */
    function fiatBalance()
        public
        view
        returns (uint)
    {
        // Price staleness check occurs inside the call to fiatValue.
        return fiatValue(address(this).balance);
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
        return safeDiv_dec(fiat, etherPrice);
    }

    /* The same as etherValue(), but without the stale price check. */
    function etherValueAllowStale(uint fiat) 
        internal
        view
        returns (uint)
    {
        return safeDiv_dec(fiat, etherPrice);
    }

    /* Return the units of fiat per nomin in the supply.
     * Reverts if the price is stale. */
    function collateralisationRatio()
        public
        view
        returns (uint)
    {
        return safeDiv_dec(fiatBalance(), _nominCap());
    }

    /* Return the maximum number of extant nomins,
     * equal to the nomin pool plus total (circulating) supply. */
    function _nominCap()
        internal
        view
        returns (uint)
    {
        return safeAdd(nominPool, totalSupply);
    }

    /* Return the fee charged on a purchase or sale of n nomins. */
    function poolFeeIncurred(uint n)
        public
        view
        returns (uint)
    {
        return safeMul_dec(n, poolFeeRate);
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
        return safeAdd(lastPriceUpdateTime, stalePeriod) < now;
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
            // Total supply of 0 means all tokens have returned to the pool.
            bool allTokensReturned = (liquidationTimestamp + 1 weeks < now) && (totalSupply == 0);
            return totalPeriodElapsed || allTokensReturned;
        }
        return false;
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
        require(!frozen[to]);
        return super.transfer(to, value);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(!frozen[to]);
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
        require(lastPriceUpdateTime < timeSent && timeSent < now + 10 minutes);

        etherPrice = price;
        lastPriceUpdateTime = timeSent;
        emit PriceUpdated(price);
    }

    /* Issues n nomins into the pool available to be bought by users.
     * Must be accompanied by $n worth of ether.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     Insufficient backing funds provided (post-issuance collateralisation below minimum requirement).
     *     Price is stale. */
    function replenishPool(uint n)
        external
        payable
        notLiquidating
        onlyOwner
    {
        // Price staleness check occurs inside the call to fiatBalance.
        // Safe additions are unnecessary here, as either the addition is checked on the following line
        // or the overflow would cause the requirement not to be satisfied.
        require(fiatBalance() >= safeMul_dec(safeAdd(_nominCap(), n), MINIMUM_ISSUANCE_RATIO));
        nominPool = safeAdd(nominPool, n);
        emit PoolReplenished(n, msg.value);
    }

    /* Burns n nomins from the pool.
     * Exceptional conditions:
     *     Not called by contract owner.
     *     There are fewer than n nomins in the pool. */
    function diminishPool(uint n)
        external
        onlyOwner
    {
        // Require that there are enough nomins in the accessible pool to burn
        require(nominPool >= n);
        nominPool = safeSub(nominPool, n);
        emit PoolDiminished(n);
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
    {
        // Price staleness check occurs inside the call to purchaseEtherCost.
        require(n >= MINIMUM_PURCHASE &&
                msg.value == purchaseCostEther(n));
        // sub requires that nominPool >= n
        nominPool = safeSub(nominPool, n);
        state.setBalanceOf(msg.sender, safeAdd(state.balanceOf(msg.sender), n));
        emit Purchased(msg.sender, msg.sender, n, msg.value);
        emit Transfer(0, msg.sender, n);
        totalSupply = safeAdd(totalSupply, n);
    }

    /* Sends n nomins to the pool from the sender, in exchange for
     * $n minus the fee worth of ether.
     * Exceptional conditions:
     *     Insufficient nomins in sender's wallet.
     *     Insufficient funds in the pool to pay sender.
     *     Price is stale if not in liquidation. */
    function sell(uint n)
        external
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

        require(address(this).balance >= proceeds);

        // sub requires that the balance is greater than n
        state.setBalanceOf(msg.sender, safeSub(state.balanceOf(msg.sender), n));
        nominPool = safeAdd(nominPool, n);
        emit Sold(msg.sender, msg.sender, n, proceeds);
        emit Transfer(msg.sender, 0, n);
        totalSupply = safeSub(totalSupply, n);
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
        external
        notLiquidating
        onlyOwner
    {
        beginLiquidation();
    }

    function beginLiquidation()
        internal
    {
        liquidationTimestamp = now;
        emit LiquidationBegun(liquidationPeriod);
    }

    /* If the contract is liquidating, the owner may extend the liquidation period.
     * It may only get longer, not shorter, and it may not be extended past
     * the liquidation max. */
    function extendLiquidationPeriod(uint extension)
        external
        onlyOwner
    {
        require(isLiquidating());
        uint sum = safeAdd(liquidationPeriod, extension);
        require(sum <= MAX_LIQUIDATION_PERIOD);
        liquidationPeriod = sum;
        emit LiquidationExtended(extension);
    }

    /* Liquidation can only be stopped if the collateralisation ratio
     * of this contract has recovered above the automatic liquidation
     * threshold, for example if the ether price has increased,
     * or by including enough ether in this transaction. */
    function terminateLiquidation()
        external
        payable
        priceNotStale
        onlyOwner
    {
        require(isLiquidating());
        require(_nominCap() == 0 || collateralisationRatio() >= AUTO_LIQUIDATION_RATIO);
        liquidationTimestamp = ~uint(0);
        liquidationPeriod = DEFAULT_LIQUIDATION_PERIOD;
        emit LiquidationTerminated();
    }

    /* The owner may destroy this contract, returning all funds back to the beneficiary
     * wallet, may only be called after the contract has been in
     * liquidation for at least liquidationPeriod, or all circulating
     * nomins have been sold back into the pool. */
    function selfDestruct()
        external
        onlyOwner
    {
        require(canSelfDestruct());
        emit SelfDestructed(beneficiary);
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
        require(!frozen[target]);

        // Confiscate the balance in the account and freeze it.
        uint balance = state.balanceOf(target);
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), balance));
        state.setBalanceOf(target, 0);
        frozen[target] = true;
        emit AccountFrozen(target, target, balance);
        emit Transfer(target, address(this), balance);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        external
        onlyOwner
    {
        if (frozen[target] && EtherNomin(target) != this) {
            frozen[target] = false;
            emit AccountUnfrozen(target, target);
        }
    }


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
        if (!isLiquidating() && _nominCap() != 0 && collateralisationRatio() < AUTO_LIQUIDATION_RATIO) {
            beginLiquidation();
        }
    }


    /* ========== EVENTS ========== */

    event PoolReplenished(uint nominsCreated, uint collateralDeposited);

    event PoolDiminished(uint nominsDestroyed);

    event Purchased(address buyer, address indexed buyerIndex, uint nomins, uint etherWei);

    event Sold(address seller, address indexed sellerIndex, uint nomins, uint etherWei);

    event PriceUpdated(uint newPrice);

    event StalePeriodUpdated(uint newPeriod);

    event OracleUpdated(address newOracle);

    event CourtUpdated(address newCourt);

    event BeneficiaryUpdated(address newBeneficiary);

    event LiquidationBegun(uint duration);

    event LiquidationTerminated();

    event LiquidationExtended(uint extension);

    event PoolFeeRateUpdated(uint newFeeRate);

    event SelfDestructed(address beneficiary);

    event AccountFrozen(address target, address indexed targetIndex, uint balance);

    event AccountUnfrozen(address target, address indexed targetIndex);
}
