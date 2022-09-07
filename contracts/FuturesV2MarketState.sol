pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./interfaces/IFuturesV2MarketBaseTypes.sol";
import "./Owned.sol";
import "./State.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesV2MarketState
contract FuturesV2MarketState is Owned, State, IFuturesV2MarketBaseTypes {
    /*
     * Each user's position. Multiple positions can always be merged, so each user has
     * only have one position at a time.
     */
    mapping(address => Position) public positions;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    function getPosition(address account) external view returns (Position memory) {
        return positions[account];
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
