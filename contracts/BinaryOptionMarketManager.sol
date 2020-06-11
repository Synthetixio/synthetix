pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./SelfDestructible.sol";
import "./MixinResolver.sol";
import "./interfaces/IBinaryOptionMarketManager.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./BinaryOptionMarketFactory.sol";
import "./BinaryOptionMarket.sol";
import "./interfaces/IBinaryOptionMarket.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";

library AddressListLib {

    struct AddressList {
        address[] elements;
        mapping(address => uint) indices;
    }

    function contains(AddressList storage list, address candidate) internal view returns (bool) {
        if (list.elements.length == 0) {
            return false;
        }
        uint index = list.indices[candidate];
        return index != 0 || list.elements[0] == candidate;
    }

    function getPage(AddressList storage list, uint index, uint pageSize) internal view returns (address[] memory) {
        // NOTE: This implementation should be converted to slice operators if the compiler is updated to v0.6.0+
        uint endIndex = index + pageSize; // The check below that endIndex <= index handles overflow.

        // If the page extends past the end of the list, truncate it.
        if (endIndex > list.elements.length) {
            endIndex = list.elements.length;
        }
        if (endIndex <= index) {
            return new address[](0);
        }

        uint n = endIndex - index; // We already checked for negative overflow.
        address[] memory page = new address[](n);
        for (uint i; i < n; i++) {
            page[i] = list.elements[i + index];
        }
        return page;
    }

    function push(AddressList storage list, address element) internal {
        list.indices[element] = list.elements.length;
        list.elements.push(element);
    }

    function remove(AddressList storage list, address element) internal {
        require(contains(list, element), "Element not in list.");
        // Replace the removed element with the last element of the list.
        uint index = list.indices[element];
        uint lastIndex = list.elements.length - 1; // We required that element is in the list, so it is not empty.
        if (index != lastIndex) {
            // No need to shift the last element if it is the one we want to delete.
            address shiftedElement = list.elements[lastIndex];
            list.elements[index] = shiftedElement;
            list.indices[shiftedElement] = index;
        }
        list.elements.pop();
        delete list.indices[element];
    }
}

contract BinaryOptionMarketManager is Owned, Pausable, SelfDestructible, MixinResolver, IBinaryOptionMarketManager {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using AddressListLib for AddressListLib.AddressList;

    /* ========== TYPES ========== */

    struct Fees {
        uint poolFee;
        uint creatorFee;
        uint refundFee;
    }

    struct Durations {
        uint maxOraclePriceAge;
        uint exerciseDuration;
        uint creatorDestructionDuration;
        uint maxTimeToMaturity;
    }

    /* ========== STATE VARIABLES ========== */

    Fees public fees;
    Durations public durations;

    uint public capitalRequirement;
    bool public marketCreationEnabled = true;
    uint public totalDeposited;

    AddressListLib.AddressList internal _activeMarkets;
    AddressListLib.AddressList internal _maturedMarkets;

    BinaryOptionMarketManager internal _migratingManager;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_BINARYOPTIONMARKETFACTORY = "BinaryOptionMarketFactory";

    bytes32[24] internal addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYNTHSUSD,
        CONTRACT_BINARYOPTIONMARKETFACTORY
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _resolver,
        uint _maxOraclePriceAge,
        uint _exerciseDuration,
        uint _creatorDestructionDuration,
        uint _maxTimeToMaturity,
        uint _capitalRequirement,
        uint _poolFee, uint _creatorFee, uint _refundFee
    )
        public
        Owned(_owner)
        Pausable()
        SelfDestructible()
        MixinResolver(_resolver, addressesToCache)
    {
        // Temporarily change the owner so that the setters don't revert.
        owner = msg.sender;
        setExerciseDuration(_exerciseDuration);
        setCreatorDestructionDuration(_creatorDestructionDuration);
        setMaxOraclePriceAge(_maxOraclePriceAge);
        setMaxTimeToMaturity(_maxTimeToMaturity);
        setCapitalRequirement(_capitalRequirement);
        setPoolFee(_poolFee);
        setCreatorFee(_creatorFee);
        setRefundFee(_refundFee);
        owner = _owner;
    }

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    function _factory() internal view returns (BinaryOptionMarketFactory) {
        return BinaryOptionMarketFactory(requireAndGetAddress(CONTRACT_BINARYOPTIONMARKETFACTORY,
            "Missing BinaryOptionMarketFactory address"));
    }


    /* ---------- Market Information ---------- */

    function _isKnownMarket(address candidate) internal view returns (bool) {
        return _activeMarkets.contains(candidate);
    }

    function numMarkets() external view returns (uint) {
        return _activeMarkets.elements.length;
    }

    function markets(uint index, uint pageSize) external view returns (address[] memory) {
        return _activeMarkets.getPage(index, pageSize);
    }

    function _publiclyDestructibleTime(address market) internal view returns (uint) {
        (, , uint destructionTime) = BinaryOptionMarket(market).times();
        return destructionTime.add(durations.creatorDestructionDuration);
    }

    function publiclyDestructibleTime(address market) external view returns (uint) {
        return _publiclyDestructibleTime(market);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setMaxOraclePriceAge(uint _maxOraclePriceAge) public onlyOwner {
        durations.maxOraclePriceAge = _maxOraclePriceAge;
        emit MaxOraclePriceAgeUpdated(_maxOraclePriceAge);
    }

    function setExerciseDuration(uint _exerciseDuration) public onlyOwner {
        durations.exerciseDuration = _exerciseDuration;
        emit ExerciseDurationUpdated(_exerciseDuration);
    }

    function setCreatorDestructionDuration(uint _creatorDestructionDuration) public onlyOwner {
        durations.creatorDestructionDuration = _creatorDestructionDuration;
        emit CreatorDestructionDurationUpdated(_creatorDestructionDuration);
    }

    function setMaxTimeToMaturity(uint _maxTimeToMaturity) public onlyOwner {
        durations.maxTimeToMaturity = _maxTimeToMaturity;
        emit MaxTimeToMaturityUpdated(_maxTimeToMaturity);
    }

    function setPoolFee(uint _poolFee) public onlyOwner {
        uint totalFee = _poolFee + fees.creatorFee;
        require(totalFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        require(0 < totalFee, "Total fee must be nonzero.");
        fees.poolFee = _poolFee;
        emit PoolFeeUpdated(_poolFee);
    }

    function setCreatorFee(uint _creatorFee) public onlyOwner {
        uint totalFee = _creatorFee + fees.poolFee;
        require(totalFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        require(0 < totalFee, "Total fee must be nonzero.");
        fees.creatorFee = _creatorFee;
        emit CreatorFeeUpdated(_creatorFee);
    }

    function setRefundFee(uint _refundFee) public onlyOwner {
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        fees.refundFee = _refundFee;
        emit RefundFeeUpdated(_refundFee);
    }

    function setCapitalRequirement(uint _capitalRequirement) public onlyOwner {
        capitalRequirement = _capitalRequirement;
        emit CapitalRequirementUpdated(_capitalRequirement);
    }

    /* ---------- Deposit Management ---------- */

    function incrementTotalDeposited(uint delta) external onlyKnownMarkets notPaused {
        _systemStatus().requireSystemActive();
        totalDeposited = totalDeposited.add(delta);
    }

    function decrementTotalDeposited(uint delta) external onlyKnownMarkets notPaused {
        _systemStatus().requireSystemActive();
        // NOTE: As individual market debt is not tracked here, the underlying markets
        //       need to be careful never to subtract more debt than they added.
        //       This can't be enforced without additional state/communication overhead.
        totalDeposited = totalDeposited.sub(delta);
    }

    /* ---------- Market Creation & Destruction ---------- */

    function createMarket(
        bytes32 oracleKey, uint strikePrice,
        uint[2] calldata times, // [biddingEnd, maturity]
        uint[2] calldata bids // [longBid, shortBid]
    )
        external
        notPaused
        returns (IBinaryOptionMarket) // no support for returning BinaryOptionMarket polymorphically given the interface
    {
        _systemStatus().requireSystemActive();
        require(marketCreationEnabled, "Market creation is disabled.");
        require(times[1] <= now + durations.maxTimeToMaturity, "Maturity too far in the future.");

        uint destructionDate = times[1].add(durations.exerciseDuration);

        // The market itself validates the capital requirement.
        BinaryOptionMarket market = _factory().createMarket(
            msg.sender,
            capitalRequirement,
            oracleKey, strikePrice,
            [times[0], times[1], destructionDate],
            bids,
            [fees.poolFee, fees.creatorFee, fees.refundFee]
        );
        market.setResolverAndSyncCache(resolver);
        _activeMarkets.push(address(market));

        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the manager doesn't know its address in order to grant it permission.
        uint initialDeposit = bids[0].add(bids[1]);
        totalDeposited = totalDeposited.add(initialDeposit);
        _sUSD().transferFrom(msg.sender, address(market), initialDeposit);

        emit MarketCreated(address(market), msg.sender, oracleKey, strikePrice, times[0], times[1], destructionDate);
        return market;
    }

    function destroyMarket(address market) external notPaused {
        _systemStatus().requireSystemActive();
        require(_isKnownMarket(market), "Market unknown.");
        require(BinaryOptionMarket(market).phase() == IBinaryOptionMarket.Phase.Destruction, "Market cannot be destroyed yet.");
        // Only check if the caller is the market creator if the market cannot be destroyed by anyone.
        if (now < _publiclyDestructibleTime(market)) {
            require(BinaryOptionMarket(market).creator() == msg.sender, "Still within creator exclusive destruction period.");
        }

        // The market itself handles decrementing the total deposits.
        BinaryOptionMarket(market).selfDestruct(msg.sender);
        // Note that we required that the market is known, which guarantees
        // its index is defined and that the list of markets is not empty.
        _activeMarkets.remove(market);

        emit MarketDestroyed(market, msg.sender);
    }

    /* ---------- Upgrade and Administration ---------- */

    function setResolverAndSyncCacheOnMarkets(AddressResolver _resolver, BinaryOptionMarket[] calldata marketsToSync) external onlyOwner {
        for (uint i = 0; i < marketsToSync.length; i++) {
            marketsToSync[i].setResolverAndSyncCache(_resolver);
        }
    }

    function setMarketCreationEnabled(bool enabled) public onlyOwner {
        if (enabled != marketCreationEnabled) {
            marketCreationEnabled = enabled;
            emit MarketCreationEnabledUpdated(enabled);
        }
    }

    function setMigratingManager(BinaryOptionMarketManager manager) public onlyOwner {
        _migratingManager = manager;
    }

    function migrateMarkets(BinaryOptionMarketManager receivingManager, BinaryOptionMarket[] calldata marketsToMigrate) external onlyOwner {
        uint _numMarkets = marketsToMigrate.length;
        if (_numMarkets == 0) {
            return;
        }

        uint runningDepositTotal;
        for (uint i; i < _numMarkets; i++) {
            BinaryOptionMarket market = marketsToMigrate[i];
            require(_isKnownMarket(address(market)), "Market unknown.");

            // Remove it from our list and deposit total.
            _activeMarkets.remove(address(market));
            runningDepositTotal = runningDepositTotal.add(market.deposited());

            // Prepare to transfer ownership to the new manager.
            market.nominateNewOwner(address(receivingManager));
        }
        // Deduct the total deposits of the migrated markets.
        totalDeposited = totalDeposited.sub(runningDepositTotal);
        emit MarketsMigrated(receivingManager, marketsToMigrate);

        // Now actually transfer the markets over to the new manager.
        receivingManager.receiveMarkets(marketsToMigrate);
    }

    function receiveMarkets(BinaryOptionMarket[] calldata marketsToReceive) external {
        require(msg.sender == address(_migratingManager), "Only permitted for migrating manager.");

        uint _numMarkets = marketsToReceive.length;
        if (_numMarkets == 0) {
            return;
        }

        uint runningDepositTotal;
        for (uint i; i < _numMarkets; i++) {
            BinaryOptionMarket market = marketsToReceive[i];
            require(!_isKnownMarket(address(market)), "Market already known.");

            market.acceptOwnership();
            _activeMarkets.push(address(market));
            // Update the market with the new manager address,
            runningDepositTotal = runningDepositTotal.add(market.deposited());
        }
        totalDeposited = totalDeposited.add(runningDepositTotal);
        emit MarketsReceived(_migratingManager, marketsToReceive);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyKnownMarkets() {
        require(_isKnownMarket(msg.sender), "Permitted only for known markets.");
        _;
    }

    /* ========== EVENTS ========== */

    event MarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint strikePrice, uint biddingEndDate, uint maturityDate, uint destructionDate);
    event MarketDestroyed(address market, address indexed destroyer);
    event MarketsMigrated(BinaryOptionMarketManager receivingManager, BinaryOptionMarket[] markets);
    event MarketsReceived(BinaryOptionMarketManager migratingManager, BinaryOptionMarket[] markets);
    event MarketCreationEnabledUpdated(bool enabled);
    event MaxOraclePriceAgeUpdated(uint duration);
    event ExerciseDurationUpdated(uint duration);
    event CreatorDestructionDurationUpdated(uint duration);
    event MaxTimeToMaturityUpdated(uint duration);
    event CapitalRequirementUpdated(uint value);
    event PoolFeeUpdated(uint fee);
    event CreatorFeeUpdated(uint fee);
    event RefundFeeUpdated(uint fee);
}
