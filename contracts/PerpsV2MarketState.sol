pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./interfaces/IPerpsV2MarketBaseTypes.sol";
import "./PerpsV2MarketStateLegacyR1.sol";
import "./Owned.sol";
import "./StateShared.sol";

// Libraries
import "./AddressSetLib.sol";

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2MarketState
// solhint-disable-next-line max-states-count
contract PerpsV2MarketState is Owned, StateShared, IPerpsV2MarketBaseTypes {
    using AddressSetLib for AddressSetLib.AddressSet;

    // Legacy state link
    PerpsV2MarketStateLegacyR1 public legacyState;
    bool public legacyLinked;
    uint public legacyFundinSequenceOffset;

    // The market identifier in the perpsV2 system (manager + settings). Multiple markets can co-exist
    // for the same asset in order to allow migrations.
    bytes32 public marketKey;

    // The asset being traded in this market. This should be a valid key into the ExchangeRates contract.
    bytes32 public baseAsset;

    // The total number of base units in long and short positions.
    uint128 public marketSize;

    /*
     * The net position in base units of the whole market.
     * When this is positive, longs outweigh shorts. When it is negative, shorts outweigh longs.
     */
    int128 public marketSkew;

    /*
     * This holds the value: sum_{p in positions}{p.margin - p.size * (p.lastPrice + fundingSequence[p.lastFundingIndex])}
     * Then marketSkew * (price + _nextFundingEntry()) + _entryDebtCorrection yields the total system debt,
     * which is equivalent to the sum of remaining margins in all positions.
     */
    int128 internal _entryDebtCorrection;

    /*
     * The funding sequence allows constant-time calculation of the funding owed to a given position.
     * Each entry in the sequence holds the net funding accumulated per base unit since the market was created.
     * Then to obtain the net funding over a particular interval, subtract the start point's sequence entry
     * from the end point's sequence entry.
     * Positions contain the funding sequence entry at the time they were confirmed; so to compute
     * the net funding on a given position, obtain from this sequence the net funding per base unit
     * since the position was confirmed and multiply it by the position size.
     */
    uint32 public fundingLastRecomputed;
    int128[] internal _fundingSequence;

    /*
     * The funding rate last time it was recomputed. The market funding rate floats and requires the previously
     * calculated funding rate, time, and current market conditions to derive the next.
     */
    int128 public fundingRateLastRecomputed;

    /*
     * Each user's position. Multiple positions can always be merged, so each user has
     * only have one position at a time.
     */
    mapping(address => Position) internal _positions;

    // The set of all addresses (positions) .
    AddressSetLib.AddressSet internal _positionAddresses;

    // The set of all addresses (delayedOrders) .
    AddressSetLib.AddressSet internal _delayedOrderAddresses;

    // This increments for each position; zero reflects a position that does not exist.
    uint64 internal _nextPositionId = 1;

    /// @dev Holds a mapping of accounts to orders. Only one order per account is supported
    mapping(address => DelayedOrder) internal _delayedOrders;

    /// @dev Holds a mapping of accounts to flagger address to flag an account. Only one order per account is supported
    mapping(address => address) public positionFlagger;
    AddressSetLib.AddressSet internal _flaggedAddresses;

    constructor(
        address _owner,
        address[] memory _associatedContracts,
        bytes32 _baseAsset,
        bytes32 _marketKey,
        address _legacyState
    ) public Owned(_owner) StateShared(_associatedContracts) {
        baseAsset = _baseAsset;
        marketKey = _marketKey;

        // Initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        _fundingSequence.push(0);

        fundingRateLastRecomputed = 0;

        // Set legacyState
        legacyState = PerpsV2MarketStateLegacyR1(_legacyState);
    }

    function linkLegacyState() external onlyOwner {
        // Confirm same asset/market key
        // TODO
        // copy atomic values
        // TODO
        // get fundingSequence offset
        // TODO
        // set legacyConfigured
        // TODO
        legacyLinked = true;
    }

    function entryDebtCorrection() external view returns (int128) {
        return _entryDebtCorrection;
    }

    function nextPositionId() external view returns (uint64) {
        return _nextPositionId;
    }

    function fundingSequence(uint index) external view returns (int128) {
        // TODO check legacy
        if (index > legacyFundinSequenceOffset) {
            // offset + 1 because we pushed an empty element on constructor
            return _fundingSequence[index - legacyFundinSequenceOffset];
        }

        return legacyState.fundingSequence(index);
    }

    function fundingSequenceLength() external view returns (uint) {
        // TODO check legacy

        return legacyFundinSequenceOffset + _fundingSequence.length;
    }

    function isFlagged(address account) external view returns (bool) {
        return positionFlagger[account] != address(0);
    }

    function positions(address account) external view returns (Position memory) {
        // TODO check legacy

        return _positions[account];
    }

    function getPositionAddressesPage(uint index, uint pageSize)
        external
        view
        onlyAssociatedContracts
        returns (address[] memory)
    {
        // TODO check legacy

        return _positionAddresses.getPage(index, pageSize);
    }

    function delayedOrders(address account) external view returns (DelayedOrder memory) {
        // TODO check legacy

        return _delayedOrders[account];
    }

    function getDelayedOrderAddressesPage(uint index, uint pageSize)
        external
        view
        onlyAssociatedContracts
        returns (address[] memory)
    {
        // TODO check legacy

        return _delayedOrderAddresses.getPage(index, pageSize);
    }

    function getFlaggedAddressesPage(uint index, uint pageSize)
        external
        view
        onlyAssociatedContracts
        returns (address[] memory)
    {
        // TODO check legacy

        return _flaggedAddresses.getPage(index, pageSize);
    }

    function getPositionAddressesLength() external view returns (uint) {
        // TODO check legacy

        return _positionAddresses.elements.length;
    }

    function getDelayedOrderAddressesLength() external view returns (uint) {
        // TODO check legacy

        return _delayedOrderAddresses.elements.length;
    }

    function getFlaggedAddressesLength() external view returns (uint) {
        return _flaggedAddresses.elements.length;
    }

    function setMarketKey(bytes32 _marketKey) external onlyLegacyLinked onlyAssociatedContracts {
        require(marketKey == bytes32(0) || _marketKey == marketKey, "Cannot change market key");
        marketKey = _marketKey;
    }

    function setBaseAsset(bytes32 _baseAsset) external onlyLegacyLinked onlyAssociatedContracts {
        require(baseAsset == bytes32(0) || _baseAsset == baseAsset, "Cannot change base asset");
        baseAsset = _baseAsset;
    }

    function setMarketSize(uint128 _marketSize) external onlyLegacyLinked onlyAssociatedContracts {
        marketSize = _marketSize;
    }

    function setEntryDebtCorrection(int128 entryDebtCorrection) external onlyLegacyLinked onlyAssociatedContracts {
        _entryDebtCorrection = entryDebtCorrection;
    }

    function setNextPositionId(uint64 nextPositionId) external onlyLegacyLinked onlyAssociatedContracts {
        _nextPositionId = nextPositionId;
    }

    function setMarketSkew(int128 _marketSkew) external onlyLegacyLinked onlyAssociatedContracts {
        marketSkew = _marketSkew;
    }

    function setFundingLastRecomputed(uint32 lastRecomputed) external onlyLegacyLinked onlyAssociatedContracts {
        fundingLastRecomputed = lastRecomputed;
    }

    function pushFundingSequence(int128 fundingSequence) external onlyLegacyLinked onlyAssociatedContracts {
        // TODO check legacy

        _fundingSequence.push(fundingSequence);
    }

    // TODO: Perform this update when maxFundingVelocity and skewScale are modified.
    function setFundingRateLastRecomputed(int128 _fundingRateLastRecomputed)
        external
        onlyLegacyLinked
        onlyAssociatedContracts
    {
        fundingRateLastRecomputed = _fundingRateLastRecomputed;
    }

    /**
     * @notice Set the position of a given account
     * @dev Only the associated contract may call this.
     * @param account The account whose value to set.
     * @param id position id.
     * @param lastFundingIndex position lastFundingIndex.
     * @param margin position margin.
     * @param lastPrice position lastPrice.
     * @param size position size.
     */
    function updatePosition(
        address account,
        uint64 id,
        uint64 lastFundingIndex,
        uint128 margin,
        uint128 lastPrice,
        int128 size
    ) external onlyLegacyLinked onlyAssociatedContracts {
        // TODO check legacy

        _positions[account] = Position(id, lastFundingIndex, margin, lastPrice, size);
        _positionAddresses.add(account);
    }

    /**
     * @notice Store a delayed order at the specified account
     * @dev Only the associated contract may call this.
     * @param account The account whose value to set.
     * @param sizeDelta Difference in position to pass to modifyPosition
     * @param priceImpactDelta Price impact tolerance as a percentage used on fillPrice at execution
     * @param targetRoundId Price oracle roundId using which price this order needs to executed
     * @param commitDeposit The commitDeposit paid upon submitting that needs to be refunded if order succeeds
     * @param keeperDeposit The keeperDeposit paid upon submitting that needs to be paid / refunded on tx confirmation
     * @param executableAtTime The timestamp at which this order is executable at
     * @param isOffchain Flag indicating if the order is offchain
     * @param trackingCode Tracking code to emit on execution for volume source fee sharing
     */
    function updateDelayedOrder(
        address account,
        bool isOffchain,
        int128 sizeDelta,
        uint128 priceImpactDelta,
        uint128 targetRoundId,
        uint128 commitDeposit,
        uint128 keeperDeposit,
        uint256 executableAtTime,
        uint256 intentionTime,
        bytes32 trackingCode
    ) external onlyLegacyLinked onlyAssociatedContracts {
        // TODO check legacy

        _delayedOrders[account] = DelayedOrder(
            isOffchain,
            sizeDelta,
            priceImpactDelta,
            targetRoundId,
            commitDeposit,
            keeperDeposit,
            executableAtTime,
            intentionTime,
            trackingCode
        );
        _delayedOrderAddresses.add(account);
    }

    /**
     * @notice Delete the position of a given account
     * @dev Only the associated contract may call this.
     * @param account The account whose position should be deleted.
     */
    function deletePosition(address account) external onlyLegacyLinked onlyAssociatedContracts {
        // TODO check legacy

        delete _positions[account];
        if (_positionAddresses.contains(account)) {
            _positionAddresses.remove(account);
        }
    }

    function deleteDelayedOrder(address account) external onlyLegacyLinked onlyAssociatedContracts {
        // TODO check legacy

        delete _delayedOrders[account];
        if (_delayedOrderAddresses.contains(account)) {
            _delayedOrderAddresses.remove(account);
        }
    }

    function flag(address account, address flagger) external onlyLegacyLinked onlyAssociatedContracts {
        positionFlagger[account] = flagger;
        _flaggedAddresses.add(account);
    }

    function unflag(address account) external onlyLegacyLinked onlyAssociatedContracts {
        delete positionFlagger[account];
        if (_flaggedAddresses.contains(account)) {
            _flaggedAddresses.remove(account);
        }
    }

    modifier onlyLegacyLinked() {
        require(legacyLinked, "State not linked");
        _;
    }
}
