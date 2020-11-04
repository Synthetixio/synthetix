pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";
import "./SignedSafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRates.sol";


// TODO: IFuturesMarket interface

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarket
contract FuturesMarket is Owned, MixinResolver {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SignedSafeDecimalMath for int;

    /* ========== TYPES ========== */
    // TODO: Move these into interface

    enum Side {Long, Short}

    struct Order {
        int size;
        uint leverage;
    }

    struct Position {
        int size;
        uint margin;
        uint entryIndex;
    }

    struct FundingParameters {
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    /* ========== STATE VARIABLES ========== */

    bytes32 public baseAsset;
    uint public exchangeFee;
    uint public maxLeverage;
    uint public maxMarketSize;
    uint public minInitialMargin;
    FundingParameters public fundingParameters;

    uint public marketSize;
    int public skew;
    uint public entryNotionalSum;

    mapping(address => Position) public positions;
    mapping(address => Order) public orders;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] internal _addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_EXRATES, CONTRACT_SYNTHSUSD, CONTRACT_FEEPOOL];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        bytes32 _baseAsset,
        uint _exchangeFee,
        uint _maxLeverage,
        uint _maxMarketSize,
        uint[3] _fundingParameters // TODO: update this to a struct
    ) public Owned(_owner) MixinResolver(_owner, addressesToCache) {
        baseAsset = _baseAsset;
        exchangeFee = _exchangeFee;
        maxLeverage = _maxLeverage;
        maxMarketSize = _maxMarketSize;
        fundingParameters.maxFundingRate = fundingParameters[0];
        fundingParameters.maxFundingRateSkew = fundingParameters[1];
        fundingParameters.maxFundingRateDelta = fundingParameters[2];
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates"));
    }

    /* ---------- Market Details ---------- */

    function price() public view returns (uint assetPrice, bool isInvalid) {
        return _exchangeRates().rateAndInvalid(baseAsset);
    }

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (uint value, bool isInvalid) {
        (uint assetPrice, bool invalid) = price();
        int positionSize = positions[account].size;
        return (int(assetPrice).multiplyDecimalRound(positionSize), invalid);
    }

    /* ---------- Utilities ---------- */

    function _abs(int x) internal pure returns (uint) {
        return x > 0 ? x : -x;
    }

    // Market size / Aggregate debt

    // Skew
    // current funding rate
    // Accrued funding sequence
    //
    // Details for a particular position
    // Notional value
    // PnL
    // Funding
    // Remaining margin
    // Liquidation price
    // Net funding

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setExchangeFee(uint fee) onlyOwner {
        exchangeFee = fee;
        emit ExchangeFeeUpdated(fee);
    }

    function setMaxLeverage(uint leverage) onlyOwner {
        maxLeverage = leverage;
        emit MaxLeverageUpdated(leverage);
    }

    function setMaxMarketSize(uint cap) onlyOwner {
        maxMarketSize = cap;
        emit MaxMarketSizeUpdated(cap);
    }

    function setMinInitialMargin(uint minMargin) onlyOwner {
        minInitialMargin = minMargin;
        emit MinInitialMarginUpdated(minMargin);
    }

    function setFundingParameters(
        uint maxFundingRate,
        uint maxFundingRateSkew,
        uint maxFundingRateDelta
    ) onlyOwner {
        fundingParameters.maxFundingRate = maxFundingRate;
        fundingParameters.maxFundingRateSkew = maxFundingRateSkew;
        fundingParameters.maxFundingRateDelta = maxFundingRateDelta;
        emit FundingParametersUpdated(maxFundingRate, maxFundingRateSkew, maxFundingRateDelta);
    }

    // modify existing position
    //  - size
    //     - -> !0 : open
    //     - -> 0  : close
    //  - margin
    //
    //
    // Modifying a position should charge fees on the portion opened on the heavier side.
    // Modifying a position should respect the minimum initial margin.
    // TODO: Make this withdraw directly from their sUSD.
    function updatePosition(int margin, uint leverage) external {
        Position storage position = positions[msg.sender];

        uint positionSize = position.size;
        uint absolutePositionSize = _abs(positionSize);
        uint newAbsoluteSize = _abs(size);

        uint leverage = newAbsoluteSize.divideDecimalRound(initialMargin);
        require(leverage <= maxLeverage, "Max leverage exceeded");

        skew = skew.sub(positionSize).add(size);
        marketSize = marketSize.sub(absolutePositionSize).add(newAbsoluteSize);

        // Modifying a position should respect the max market size.
        require(marketSize <= maxMarketSize, "Max market size exceeded");

        return;
    }

    function closePosition() external {
        return;
    }

    function cancelPositionUpdate() external {
        return;
    }

    // Order confirmation should emit event including the price at which it was confirmed
    function confirmPositionUpdate()(address account) external {
        return;
    }

    event ExchangeFeeUpdated(uint fee);
    event MaxLeverageUpdated(uint leverage);
    event MaxMarketSizeUpdated(uint cap);
    event MinInitialMarginUpdated(uint minMargin);
    event FundingParametersUpdated(uint maxFundingRate, uint maxFundingRateSkew, uint maxFundingRateDelta);
}
