pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./interfaces/IFuturesV2MarketBaseTypes.sol";
import "./Owned.sol";
import "./State.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesV2MarketState
contract FuturesV2MarketState is Owned, State, IFuturesV2MarketBaseTypes {
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
    int128[] public fundingSequence;

    /*
     * Each user's position. Multiple positions can always be merged, so each user has
     * only have one position at a time.
     */
    mapping(address => Position) public positions;

    // This increments for each position; zero reflects a position that does not exist.
    uint64 internal _nextPositionId = 1;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {
        // Initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        fundingSequence.push(0);
    }

    function entryDebtCorrection() external view onlyAssociatedContract returns (int128) {
        return _entryDebtCorrection;
    }

    function nextPositionId() external view onlyAssociatedContract returns (uint64) {
        return _nextPositionId;
    }

    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    function getPosition(address account) external view returns (Position memory) {
        return positions[account];
    }

    function setEntryDebtCorrection(int128 entryDebtCorrection) external onlyAssociatedContract {
        _entryDebtCorrection = entryDebtCorrection;
    }

    function setNextPositionId(uint64 nextPositionId) external onlyAssociatedContract {
        _nextPositionId = nextPositionId;
    }

    function setMarketSkew(int128 _marketSkew) external onlyAssociatedContract {
        marketSkew = _marketSkew;
    }

    function setFundingLastRecomputed(uint32 lastRecomputed) external onlyAssociatedContract {
        fundingLastRecomputed = lastRecomputed;
    }

    function pushFundingSequence(int128 _fundingSequence) external onlyAssociatedContract {
        fundingSequence.push(_fundingSequence);
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
    ) external onlyAssociatedContract {
        positions[account] = Position(id, lastFundingIndex, margin, lastPrice, size);
    }

    /**
     * @notice Delete the position of a given account
     * @dev Only the associated contract may call this.
     * @param account The account whose position should be deleted.
     */
    function deletePosition(address account) external onlyAssociatedContract {
        delete positions[account];
    }
}
