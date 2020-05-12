pragma solidity ^0.5.16;

import "./Owned.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: System status?

// TODO: Pausable

contract BinaryOptionMarketFactory is Owned {
    using SafeMath for uint;

    uint256 public poolFee; // The percentage fee remitted to the fee pool from new markets.
    uint256 public creatorFee; // The percentage fee remitted to the creators of new markets.
    uint256 public refundFee; // The percentage fee that remains in a new market if a position is refunded.

    BinaryOptionMarket[] public activeMarkets; // An unordered list of the currently active markets.
    mapping(address => bool) public isActiveMarket;

    //TODO: Record aggregate debt from underlying markets.
    uint256 public totalDebt;

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
        refundFee = _refundFee;
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
    }

    function createMarket(uint256 endOfBidding, uint256 maturity,
                        uint256 targetPrice,
                        uint256 longBid, uint256 shortBid) public returns (BinaryOptionMarket) {
        //TODO: take initial deposit / capital
        BinaryOptionMarket market = new BinaryOptionMarket(endOfBidding, maturity, targetPrice, longBid, shortBid, poolFee, creatorFee, refundFee);
        activeMarkets.push(market);
        isActiveMarket[address(market)] = true;

        emit BinaryOptionMarketCreated(msg.sender, market);
    }

    function incrementTotalDebt(uint256 delta) public onlyActiveMarket {
        totalDebt = totalDebt.add(delta);
    }

    function decrementTotalDebt(uint256 delta) public onlyActiveMarket {
        totalDebt = totalDebt.add(delta);
    }

    modifier onlyActiveMarket() {
        require(isActiveMarket[msg.sender], "Only active markets can alter the debt.");
        _;
    }

    //TODO: Proxify this.

    //TODO: MixinResolver etc. to find appropriate contracts.

    // TODO: Augment the event with the initial asset type.
    event BinaryOptionMarketCreated(address indexed creator, BinaryOptionMarket market);
}
