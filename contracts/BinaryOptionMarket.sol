pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./BinaryOptionMarketManager.sol";
import "./BinaryOption.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFeePool.sol";

contract BinaryOptionMarket is Owned, MixinResolver {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== TYPES ========== */

    enum Phase { Bidding, Trading, Maturity, Destruction }
    enum Side { Long, Short }

    struct Options {
        BinaryOption long;
        BinaryOption short;
    }

    struct Prices {
        uint long;
        uint short;
    }

    struct Times {
        uint biddingEnd;
        uint maturity;
        uint destruction;
    }

    struct OracleDetails {
        bytes32 key;
        uint targetPrice;
        uint finalPrice;
    }

    struct Fees {
        uint poolFee;
        uint creatorFee;
        uint refundFee;
        uint creatorFeesCollected;
    }

    /* ========== STATE VARIABLES ========== */

    address public creator;

    Options public options;
    Prices public prices;
    Times public times;
    OracleDetails public oracleDetails;
    Fees public fees;

    // We track the sum of open bids on short and long, plus withheld refund fees.
    // We must keep this explicitly, in case tokens are transferred to this contract directly.
    uint public deposited;
    uint public minimumInitialLiquidity;
    bool public resolved;

    uint internal _feeMultiplier;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] internal addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_EXRATES,
        CONTRACT_SYNTHSUSD,
        CONTRACT_FEEPOOL
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _creator,
                uint _minimumInitialLiquidity,
                bytes32 _oracleKey, uint _targetOraclePrice,
                uint[3] memory _times, // [biddingEnd, maturity, destruction]
                uint[2] memory _bids, // [longBid, shortBid]
                uint[3] memory _fees // [poolFee, creatorFee, refundFee]
    )
        public
        Owned(_owner)
        MixinResolver(_owner, addressesToCache) // The resolver is initially set to the owner, but it will be set correctly when the cache is synchronised
    {
        require(_creator != address(0), "Creator must not be the 0 address.");
        creator = _creator;

        // Note that the initial deposit of synths must be made
        // externally by the manager, otherwise the contracts will
        // fall out of sync with reality.
        // Similarly the total system deposits must be updated in the manager.
        uint initialDeposit = _bids[0].add(_bids[1]);
        require(_minimumInitialLiquidity <= initialDeposit, "Insufficient initial capital provided.");
        minimumInitialLiquidity = _minimumInitialLiquidity;
        deposited = initialDeposit;

        require(now < _times[0], "End of bidding must be in the future.");
        require(_times[0] < _times[1], "Maturity must be after the end of bidding.");
        require(_times[1] < _times[2], "Destruction must be after maturity.");
        times = Times(_times[0], _times[1], _times[2]);

        require(_fees[2] <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        uint totalFee = _fees[0].add(_fees[1]);
        require(totalFee < SafeDecimalMath.unit(), "Fee must be less than 100%.");
        require(0 < totalFee, "Fee must be nonzero."); // The collected fees also absorb rounding errors.
        fees = Fees(_fees[0], _fees[1], _fees[2], 0);
        _feeMultiplier = SafeDecimalMath.unit().sub(_fees[0].add(_fees[1]));

        oracleDetails = OracleDetails(_oracleKey, _targetOraclePrice, 0);

        // Compute the prices now that the fees and deposits have been set.
        _updatePrices(_bids[0], _bids[1], initialDeposit);

        // Instantiate the options themselves
        options.long = new BinaryOption(_creator, _bids[0]);
        options.short = new BinaryOption(_creator, _bids[1]);
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool address"));
    }

    function _manager() internal view returns (BinaryOptionMarketManager) {
        return BinaryOptionMarketManager(owner);
    }

    /* ---------- Phases ---------- */

    function _biddingEnded() internal view returns (bool) {
        return times.biddingEnd <= now;
    }

    function _matured() internal view returns (bool) {
        return times.maturity <= now;
    }

    function _destructible() internal view returns (bool) {
        return times.destruction <= now;
    }

    function phase() external view returns (Phase) {
        if (!_biddingEnded()) {
            return Phase.Bidding;
        }
        if (!_matured()) {
            return Phase.Trading;
        }
        if (!_destructible()) {
            return Phase.Maturity;
        }
        return Phase.Destruction;
    }

    /* ---------- Market Resolution ---------- */

    function _oraclePriceAndTimestamp() internal view returns (uint price, uint updatedAt) {
        IExchangeRates exRates = _exchangeRates();
        uint currentRoundId = exRates.getCurrentRoundId(oracleDetails.key);
        return exRates.rateAndTimestampAtRound(oracleDetails.key, currentRoundId);
    }

    function oraclePriceAndTimestamp() external view returns (uint price, uint updatedAt) {
        return _oraclePriceAndTimestamp();
    }

    function _withinMaturityWindow(uint timestamp) internal view returns (bool) {
        (uint maturityWindow, , , ) = _manager().durations();
        return (times.maturity.sub(maturityWindow)) <= timestamp;
    }

    function canResolve() external view returns (bool) {
        (, uint updatedAt) = _oraclePriceAndTimestamp();
        return _matured() && _withinMaturityWindow(updatedAt) && !resolved;
    }

    function _result() internal view returns (Side) {
        uint price;
        if (resolved) {
            price = oracleDetails.finalPrice;
        } else {
            (price, ) = _oraclePriceAndTimestamp();
        }

        if (oracleDetails.targetPrice <= price) {
            return Side.Long;
        }
        return Side.Short;
    }

    function result() external view returns (Side) {
        return _result();
    }

    /* ---------- Market Destruction ---------- */

    function _destructionReward(uint _deposited) internal view returns (uint) {
        uint creatorFees = fees.creatorFeesCollected;

        // This case can only occur if the pool fee is zero (or very close to it).
        if (_deposited < creatorFees) {
            return _deposited;
        }

        // Unexercised deposits on the winning side are now claimed by the creator.
        uint recoverable = _option(_result()).totalExercisable().add(creatorFees);

        // This case can only occur if the creator fee and pool fee are zero (or very close to it).
        if (_deposited < recoverable) {
            return _deposited;
        }

        return recoverable;
    }

    function destructionReward() external view returns (uint) {
        if (!(resolved && _destructible())) {
            return 0;
        }
        return _destructionReward(deposited);
    }

    /* ---------- Option Prices ---------- */

    function senderPrice() external view returns (uint) {
        if (msg.sender == address(options.long)) {
            return prices.long;
        }
        if (msg.sender == address(options.short)) {
            return prices.short;
        }
        revert("Message sender is not an option of this market.");
    }

    /* ---------- Option Balances and Bids ---------- */


    function _bidsOf(address account) internal view returns (uint long, uint short) {
        return (options.long.bidOf(account), options.short.bidOf(account));
    }

    function bidsOf(address account) external view returns (uint long, uint short) {
        return _bidsOf(account);
    }

    function _totalBids() internal view returns (uint long, uint short) {
        return (options.long.totalBids(), options.short.totalBids());
    }

    function totalBids() external view returns (uint long, uint short) {
        return _totalBids();
    }

    function _claimableBy(address account) internal view returns (uint long, uint short) {
        return (options.long.claimableBy(account), options.short.claimableBy(account));
    }

    function claimableBy(address account) external view returns (uint long, uint short) {
        return _claimableBy(account);
    }

    function totalClaimable() external view returns (uint long, uint short) {
        return (options.long.totalClaimable(), options.short.totalClaimable());
    }

    function _balancesOf(address account) internal view returns (uint long, uint short) {
        return (options.long.balanceOf(account), options.short.balanceOf(account));
    }

    function balancesOf(address account) external view returns (uint long, uint short) {
        return _balancesOf(account);
    }

    function totalSupplies() external view returns (uint long, uint short) {
        return (options.long.totalSupply(), options.short.totalSupply());
    }

    function totalExercisable() external view returns (uint long, uint short) {
        return (options.long.totalExercisable(), options.short.totalExercisable());
    }

    /* ---------- Utilities ---------- */

    function _chooseSide(Side side, uint longValue, uint shortValue) internal pure returns (uint) {
        if (side == Side.Long) {
            return longValue;
        }
        return shortValue;
    }

    function _option(Side side) internal view returns (BinaryOption) {
        if (side == Side.Long) {
            return options.long;
        }
        return options.short;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Bidding and Refunding ---------- */

    function _updatePrices(uint longBids, uint shortBids, uint _deposited) internal {
        require(longBids != 0 && shortBids != 0, "Bids on each side must be nonzero.");
        uint optionsPerSide = _deposited.multiplyDecimalRound(_feeMultiplier);

        // The math library rounds up on an exact half-increment -- the price on one side may be an increment too high,
        // but this only implies a tiny extra quantity will go to fees.
        uint longPrice = longBids.divideDecimalRound(optionsPerSide);
        uint shortPrice = shortBids.divideDecimalRound(optionsPerSide);

        prices = Prices(longPrice, shortPrice);
        emit PricesUpdated(longPrice, shortPrice);
    }

    function bid(Side side, uint value) external onlyDuringBidding {
        if (value == 0) {
            return;
        }

        _option(side).bid(msg.sender, value);
        emit Bid(side, msg.sender, value);

        uint _deposited = deposited.add(value);
        deposited = _deposited;
        _manager().incrementTotalDeposited(value);
        _sUSD().transferFrom(msg.sender, address(this), value);

        (uint longTotalBids, uint shortTotalBids) = _totalBids();
        _updatePrices(longTotalBids, shortTotalBids, _deposited);
    }

    function refund(Side side, uint value) external onlyDuringBidding returns (uint refundMinusFee) {
        if (value == 0) {
            return 0;
        }

        // Require the market creator to leave sufficient capital in the market.
        if (msg.sender == creator) {
            (uint longBid, uint shortBid) = _bidsOf(msg.sender);
            uint creatorCapital = longBid.add(shortBid);
            require(minimumInitialLiquidity <= creatorCapital.sub(value), "Minimum creator capital requirement violated.");

            uint thisBid = _chooseSide(side, longBid, shortBid);
            require(value < thisBid, "Cannot refund entire creator position.");
        }

        // Safe subtraction here and in related contracts will fail if either the
        // total supply, deposits, or wallet balance are too small to support the refund.
        uint refundSansFee = value.multiplyDecimalRound(SafeDecimalMath.unit().sub(fees.refundFee));

        _option(side).refund(msg.sender, value);
        emit Refund(side, msg.sender, refundSansFee, value.sub(refundSansFee));

        uint _deposited = deposited.sub(refundSansFee);
        deposited = _deposited;
        _manager().decrementTotalDeposited(refundSansFee);
        _sUSD().transfer(msg.sender, refundSansFee);

        (uint longTotalBids, uint shortTotalBids) = _totalBids();
        _updatePrices(longTotalBids, shortTotalBids, _deposited);
        return refundSansFee;
    }

    /* ---------- Market Resolution ---------- */

    function _resolve() internal onlyAfterMaturity managerNotPaused {
        require(!resolved, "The market has already resolved.");
        _systemStatus().requireSystemActive();

        // We don't need to perform stale price checks, so long as the price was
        // last updated after the maturity date.
        (uint price, uint updatedAt) = _oraclePriceAndTimestamp();
        require(_withinMaturityWindow(updatedAt), "The price was last updated before the maturity window.");

        oracleDetails.finalPrice = price;
        resolved = true;

        // Save the fees collected since payouts will be made, meaning
        // the fee take will no longer be computable from the current deposits.
        fees.creatorFeesCollected = deposited.multiplyDecimalRound(fees.creatorFee);

        emit MarketResolved(_result(), price, updatedAt);
    }

    function resolve() external {
        _resolve();
    }


    /* ---------- Claiming and Exercising Options ---------- */

    function _claimOptions() internal onlyAfterBidding managerNotPaused returns (uint longClaimed, uint shortClaimed) {
        _systemStatus().requireSystemActive();

        uint longOptions = options.long.claim(msg.sender);
        uint shortOptions = options.short.claim(msg.sender);

        require(longOptions != 0 || shortOptions != 0, "No options to claim.");
        emit OptionsClaimed(msg.sender, longOptions, shortOptions);
        return (longOptions, shortOptions);
    }

    function claimOptions() external returns (uint longClaimed, uint shortClaimed) {
        return _claimOptions();
    }


    function exerciseOptions() external returns (uint) {
        // The market must be resolved if it has not been.
        if (!resolved) {
            _resolve();
        }

        // If there are options to be claimed, claim them and proceed.
        (uint claimableLong, uint claimableShort) = _claimableBy(msg.sender);
        if (claimableLong != 0 || claimableShort != 0) {
            _claimOptions();
        }

        // If the account holds no options, revert.
        (uint longBalance, uint shortBalance) = _balancesOf(msg.sender);
        require(longBalance != 0 || shortBalance != 0, "No options to exercise.");

        // Each option only needs to be exercised if the account holds any of it.
        if (longBalance != 0) {
            options.long.exercise(msg.sender);
        }
        if (shortBalance != 0) {
            options.short.exercise(msg.sender);
        }

        // Only pay out the side that won.
        uint payout = _chooseSide(_result(), longBalance, shortBalance);
        emit OptionsExercised(msg.sender, payout);
        if (payout != 0) {
            deposited = deposited.sub(payout);
            _manager().decrementTotalDeposited(payout);
            _sUSD().transfer(msg.sender, payout);
        }
        return payout;
    }

    /* ---------- Market Destruction ---------- */

    function selfDestruct(address payable beneficiary) external onlyOwner {
        require(resolved, "Market unresolved.");
        require(_destructible(), "Market cannot be destroyed yet.");

        uint _deposited = deposited;
        _manager().decrementTotalDeposited(_deposited);
        // And the self destruction implies the corresponding `deposited = 0;`

        // The creator fee, along with any unclaimed funds, will go to the beneficiary.
        // If the quantity remaining is too small or large due to rounding errors or direct transfers,
        // this will affect the pool's fee take.
        IERC20 sUSD = _sUSD();
        sUSD.transfer(beneficiary, _destructionReward(_deposited));

        // Transfer the balance rather than the deposit value in case any synths have been sent directly.
        sUSD.transfer(_feePool().FEE_ADDRESS(), sUSD.balanceOf(address(this)));

        // Destroy the option tokens before destroying the market itself.
        options.long.selfDestruct(beneficiary);
        options.short.selfDestruct(beneficiary);

        // Good night
        selfdestruct(beneficiary);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyDuringBidding() {
        require(!_biddingEnded(), "Bidding must be active.");
        _;
    }

    modifier onlyAfterBidding() {
        require(_biddingEnded(), "Bidding must be complete.");
        _;
    }

    modifier onlyAfterMaturity() {
        require(_matured(), "The maturity date has not been reached.");
        _;
    }

    modifier managerNotPaused() {
        require(!_manager().paused(), "This action cannot be performed while the contract is paused");
        _;
    }

    /* ========== EVENTS ========== */

    event Bid(Side side, address indexed account, uint value);
    event Refund(Side side, address indexed account, uint value, uint fee);
    event PricesUpdated(uint longPrice, uint shortPrice);
    event MarketResolved(Side result, uint oraclePrice, uint oracleTimestamp);
    event OptionsClaimed(address indexed account, uint longOptions, uint shortOptions);
    event OptionsExercised(address indexed account, uint value);
}
