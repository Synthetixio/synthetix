pragma solidity ^0.5.16;

import "./Owned.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: System status?

// TODO: Pausable

// TODO: Proxify this.

// TODO: MixinResolver etc. to find appropriate contracts.


contract BinaryOptionMarketFactory is Owned {
    using SafeMath for uint;

    uint256 public poolFee; // The percentage fee remitted to the fee pool from new markets.
    uint256 public creatorFee; // The percentage fee remitted to the creators of new markets.
    uint256 public refundFee; // The percentage fee that remains in a new market if a position is refunded.

    BinaryOptionMarket[] public activeMarkets; // An unordered list of the currently active markets.
    mapping(address => bool) public isActiveMarket;

    uint256 public totalDebt; // The sum of debt from all binary option markets.

    constructor(address _owner, uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee) public Owned(_owner) {
        setPoolFee(_poolFee);
        setCreatorFee(_creatorFee);
        setRefundFee(_refundFee);
    }

    function numActiveMarkets() public view returns (uint256) {
        return activeMarkets.length;
    }

    function setPoolFee(uint256 _poolFee) public {
        poolFee = _poolFee;
        require(poolFee + creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
    }

    function setCreatorFee(uint256 _creatorFee) public {
        creatorFee = _creatorFee;
        require(poolFee + creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
    }

    function setRefundFee(uint256 _refundFee) public {
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        refundFee = _refundFee;
    }

    function createMarket(uint256 endOfBidding, uint256 maturity,
                        uint256 targetPrice,
                        uint256 longBid, uint256 shortBid) external returns (BinaryOptionMarket) {
        //TODO: take initial deposit / capital
        BinaryOptionMarket market = new BinaryOptionMarket(endOfBidding, maturity, targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee);
        activeMarkets.push(market);
        isActiveMarket[address(market)] = true;

        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the factory doesn't know its address in order to allow it permission.
        totalDebt = totalDebt.add(longBid.add(shortBid));

        emit BinaryOptionMarketCreated(msg.sender, market);
    }

    function incrementTotalDebt(uint256 delta) external onlyActiveMarket {
        totalDebt = totalDebt.add(delta);
    }

    // NOTE: As individual market debt is not tracked here, the underlying markets
    //       need to be careful never to subtract more debt than they added.
    //       This can't be enforced without additional state/communication overhead.
    function decrementTotalDebt(uint256 delta) external onlyActiveMarket {
        totalDebt = totalDebt.sub(delta);
    }

    modifier onlyActiveMarket() {
        require(isActiveMarket[msg.sender], "Only active markets can alter the debt.");
        _;
    }

    // TODO: Augment the event with the initial asset type.
    event BinaryOptionMarketCreated(address indexed creator, BinaryOptionMarket market);
}
