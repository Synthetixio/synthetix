pragma solidity ^0.5.16;

import "./Owned.sol";
import "./Pausable.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISynth.sol";

contract BinaryOptionMarketFactory is Owned, Pausable, MixinResolver {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;

    /* ========== TYPES ========== */

    struct Durations {
        uint256 oracleMaturityWindow;
        uint256 exerciseDuration;
        uint256 creatorDestructionDuration;
        uint256 maxTimeToMaturity;
    }

    /* ========== STATE VARIABLES ========== */

    BinaryOptionMarket.Fees public fees;
    Durations public durations;

    uint256 public minimumInitialLiquidity;
    uint256 public totalDeposited;
    bool public marketCreationEnabled = true;

    address[] private _markets;
    mapping(address => uint256) private marketIndices;

    BinaryOptionMarketFactory private _migratingFactory;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYNTHSUSD
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _resolver,
        uint256 _oracleMaturityWindow,
        uint256 _exerciseDuration,
        uint256 _creatorDestructionDuration,
        uint256 _maxTimeToMaturity,
        uint256 _minimumInitialLiquidity,
        uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        Owned(_owner)
        Pausable()
        MixinResolver(_resolver, addressesToCache)
    {
        // Temporarily change the owner so that the setters don't revert.
        owner = msg.sender;
        setExerciseDuration(_exerciseDuration);
        setCreatorDestructionDuration(_creatorDestructionDuration);
        setOracleMaturityWindow(_oracleMaturityWindow);
        setMaxTimeToMaturity(_maxTimeToMaturity);
        setMinimumInitialLiquidity(_minimumInitialLiquidity);
        setPoolFee(_poolFee);
        setCreatorFee(_creatorFee);
        setRefundFee(_refundFee);
        owner = _owner;
    }

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function sUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    /* ---------- Market Information ---------- */

    function numMarkets() public view returns (uint256) {
        return _markets.length;
    }

    // NOTE: This should be converted to slice operators if the compiler is updated to v0.6.0+
    function markets(uint256 index, uint256 pageSize) public view returns (address[] memory) {
        uint256 endIndex = index.add(pageSize);

        // If the page extends past the end of the list, truncate it.
        if (endIndex > _markets.length) {
            endIndex = _markets.length;
        }
        if (endIndex <= index) {
            return new address[](0);
        }

        uint256 n = endIndex.sub(index);
        address[] memory page = new address[](n);
        for (uint256 i; i < n; i++) {
            page[i] = _markets[i + index];
        }
        return page;
    }

    function _isKnownMarket(address candidate) internal view returns (bool) {
        if (_markets.length == 0) {
            return false;
        }
        uint256 index = marketIndices[candidate];
        if (index == 0) {
            return _markets[0] == candidate;
        }
        return true;
    }

    function publiclyDestructibleTime(address market) public view returns (uint256) {
        (, , uint256 destructionTime) = BinaryOptionMarket(market).times();
        return destructionTime.add(durations.creatorDestructionDuration);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setOracleMaturityWindow(uint256 _oracleMaturityWindow) public onlyOwner {
        durations.oracleMaturityWindow = _oracleMaturityWindow;
        emit OracleMaturityWindowChanged(_oracleMaturityWindow);
    }

    function setExerciseDuration(uint256 _exerciseDuration) public onlyOwner {
        durations.exerciseDuration = _exerciseDuration;
        emit ExerciseDurationChanged(_exerciseDuration);
    }

    function setCreatorDestructionDuration(uint256 _creatorDestructionDuration) public onlyOwner {
        durations.creatorDestructionDuration = _creatorDestructionDuration;
        emit CreatorDestructionDurationChanged(_creatorDestructionDuration);
    }

    function setMaxTimeToMaturity(uint256 _maxTimeToMaturity) public onlyOwner {
        durations.maxTimeToMaturity = _maxTimeToMaturity;
        emit MaxTimeToMaturityChanged(_maxTimeToMaturity);
    }

    function setPoolFee(uint256 _poolFee) public onlyOwner {
        require(_poolFee + fees.creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        fees.poolFee = _poolFee;
        emit PoolFeeChanged(_poolFee);
    }

    function setCreatorFee(uint256 _creatorFee) public onlyOwner {
        require(fees.poolFee + _creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        fees.creatorFee = _creatorFee;
        emit CreatorFeeChanged(_creatorFee);
    }

    function setRefundFee(uint256 _refundFee) public onlyOwner {
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        fees.refundFee = _refundFee;
        emit RefundFeeChanged(_refundFee);
    }

    function setMinimumInitialLiquidity(uint256 _minimumInitialLiquidity) public onlyOwner {
        minimumInitialLiquidity = _minimumInitialLiquidity;
        emit MinimumInitialLiquidityChanged(_minimumInitialLiquidity);
    }

    /* ---------- Deposit Management ---------- */

    function incrementTotalDeposited(uint256 delta) external onlyKnownMarkets notPaused {
        systemStatus().requireSystemActive();
        totalDeposited = totalDeposited.add(delta);
    }

    function decrementTotalDeposited(uint256 delta) external onlyKnownMarkets notPaused {
        systemStatus().requireSystemActive();
        // NOTE: As individual market debt is not tracked here, the underlying markets
        //       need to be careful never to subtract more debt than they added.
        //       This can't be enforced without additional state/communication overhead.
        totalDeposited = totalDeposited.sub(delta);
    }

    /* ---------- Market Creation & Destruction ---------- */

    function _addMarket(address market) internal {
        marketIndices[market] = _markets.length;
        _markets.push(market);
    }

    function _removeMarket(address market) internal {
        // Replace the removed element with the last element of the list.
        // Note that we required that the market is known, which guarantees
        // its index is defined and that the list of markets is not empty.
        uint256 index = marketIndices[market];
        uint256 lastIndex = _markets.length.sub(1);
        if (index != lastIndex) {
            // No need to shift the last element if it is the one we want to delete.
            address shiftedAddress = _markets[lastIndex];
            _markets[index] = shiftedAddress;
            marketIndices[shiftedAddress] = index;
        }
        _markets.pop();
        delete marketIndices[market];
    }

    function createMarket(
        uint256 endOfBidding, uint256 maturity,
        bytes32 oracleKey, uint256 targetPrice,
        uint256 longBid, uint256 shortBid
    )
        external
        notPaused
        returns (BinaryOptionMarket)
    {
        systemStatus().requireSystemActive();
        require(marketCreationEnabled, "Market creation is disabled.");
        require(maturity <= now + durations.maxTimeToMaturity, "Maturity too far in the future.");

        // The market itself validates the minimum initial liquidity requirement.
        BinaryOptionMarket market = new BinaryOptionMarket(
            address(resolver),
            endOfBidding,
            maturity,
            maturity.add(durations.exerciseDuration),
            oracleKey,
            targetPrice,
            durations.oracleMaturityWindow,
            minimumInitialLiquidity,
            msg.sender, longBid, shortBid,
            fees.poolFee, fees.creatorFee, fees.refundFee);
        market.setResolverAndSyncCache(resolver);

        _addMarket(address(market));
        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the factory doesn't know its address in order to grant it permission.
        uint256 initialDeposit = longBid.add(shortBid);
        totalDeposited = totalDeposited.add(initialDeposit);
        sUSD().transferFrom(msg.sender, address(market), initialDeposit);

        emit MarketCreated(address(market), msg.sender, oracleKey, targetPrice, endOfBidding, maturity);
        return market;
    }

    function destroyMarket(address market) external notPaused {
        systemStatus().requireSystemActive();
        require(_isKnownMarket(market), "Market unknown.");
        require(BinaryOptionMarket(market).phase() == BinaryOptionMarket.Phase.Destruction, "Market cannot be destroyed yet.");
        // Only check if the caller is the market creator if the market cannot be destroyed by anyone.
        if (now < publiclyDestructibleTime(market)) {
            require(BinaryOptionMarket(market).creator() == msg.sender, "Still within creator exclusive destruction period.");
        }

        // The market itself handles decrementing the total deposits.
        BinaryOptionMarket(market).selfDestruct(msg.sender);
        _removeMarket(market);

        emit MarketDestroyed(market, msg.sender);
    }

    /* ---------- Upgrade and Administration ---------- */

    function setMarketCreationEnabled(bool enabled) public onlyOwner {
        if (enabled != marketCreationEnabled) {
            marketCreationEnabled = enabled;
            emit MarketCreationChanged(enabled);
        }
    }

    function setMigratingFactory(BinaryOptionMarketFactory factory) public onlyOwner {
        _migratingFactory = factory;
    }

    function migrateMarkets(BinaryOptionMarketFactory receivingFactory, BinaryOptionMarket[] calldata marketsToMigrate) external onlyOwner {
        uint256 _numMarkets = marketsToMigrate.length;
        if (_numMarkets == 0) {
            return;
        }

        uint256 runningDepositTotal;
        for (uint256 i; i < _numMarkets; i++) {
            BinaryOptionMarket market = marketsToMigrate[i];
            require(_isKnownMarket(address(market)), "Market unknown.");

            // Remove it from our list and deposit total.
            _removeMarket(address(market));
            runningDepositTotal = runningDepositTotal.add(market.deposited());

            // Prepare to transfer ownership to the new factory.
            market.nominateNewOwner(address(receivingFactory));
        }
        // Deduct the total deposits of the migrated markets.
        totalDeposited = totalDeposited.sub(runningDepositTotal);
        emit MarketsMigrated(receivingFactory, marketsToMigrate);

        // Now actually transfer the markets over to the new factory.
        receivingFactory.receiveMarkets(marketsToMigrate);
    }

    function receiveMarkets(BinaryOptionMarket[] calldata marketsToReceive) external {
        require(msg.sender == address(_migratingFactory), "Only permitted for migrating factory.");

        uint256 _numMarkets = marketsToReceive.length;
        if (_numMarkets == 0) {
            return;
        }

        uint256 runningDepositTotal;
        for (uint256 i; i < _numMarkets; i++) {
            BinaryOptionMarket market = marketsToReceive[i];
            require(!_isKnownMarket(address(market)), "Market already known.");

            market.acceptOwnership();
            _addMarket(address(market));
            // Update the market with the new factory address,
            runningDepositTotal = runningDepositTotal.add(market.deposited());
        }
        totalDeposited = totalDeposited.add(runningDepositTotal);
        emit MarketsReceived(_migratingFactory, marketsToReceive);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyKnownMarkets() {
        require(_isKnownMarket(msg.sender), "Permitted only for known markets.");
        _;
    }

    /* ========== EVENTS ========== */

    event MarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint256 targetPrice, uint256 endOfBidding, uint256 maturity);
    event MarketDestroyed(address market, address indexed destroyer);
    event MarketsMigrated(BinaryOptionMarketFactory receivingFactory, BinaryOptionMarket[] markets);
    event MarketsReceived(BinaryOptionMarketFactory migratingFactory, BinaryOptionMarket[] markets);
    event MarketCreationChanged(bool enabled);
    event OracleMaturityWindowChanged(uint256 duration);
    event ExerciseDurationChanged(uint256 duration);
    event CreatorDestructionDurationChanged(uint256 duration);
    event MaxTimeToMaturityChanged(uint256 duration);
    event MinimumInitialLiquidityChanged(uint256 value);
    event PoolFeeChanged(uint256 fee);
    event CreatorFeeChanged(uint256 fee);
    event RefundFeeChanged(uint256 fee);
}
