pragma solidity ^0.5.16;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";
import "./interfaces/ISynth.sol";

// TODO: System status?
// TODO: Pausable
// TODO: Proxify
// TODO: Consider adding further information to the market creation event (e.g. oracle key)
// TODO: Allow markets to be destroyed if all options have been exercised.
// TODO: Allow markets to be destroyed by anyone if the creator did not get around to it.

contract BinaryOptionMarketFactory is Owned, MixinResolver {
    using SafeMath for uint;

    uint256 public oracleMaturityWindow; // Prices are valid if they were last updated within this duration of the maturity date.
    uint256 public exerciseWindow; // The duration a market stays open after resolution for options to be exercised.

    uint256 public poolFee; // The percentage fee remitted to the fee pool from new markets.
    uint256 public creatorFee; // The percentage fee remitted to the creators of new markets.
    uint256 public refundFee; // The percentage fee that remains in a new market if a position is refunded.

    address[] public markets; // An unordered list of the currently active markets.
    mapping(address => uint256) private marketIndices;

    uint256 public totalDeposited; // The sum of debt from all binary option markets.

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHSUSD
    ];

    constructor(
        address _owner, address _resolver,
        uint256 _oracleMaturityWindow, uint256 _exerciseWindow,
        uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
    {
        // Temporarily change the owner so that the setters don't revert.
        owner = msg.sender;
        setExerciseWindow(_exerciseWindow);
        setOracleMaturityWindow(_oracleMaturityWindow);
        setPoolFee(_poolFee);
        setCreatorFee(_creatorFee);
        setRefundFee(_refundFee);
        owner = _owner;
    }
    
    function synthsUSD() public view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }
    
    function marketArray() public view returns (address[] memory) {
        return markets;
    }
    
    function numMarkets() public view returns (uint256) {
        return markets.length;
    }

    function _isKnownMarket(address candidate) internal view returns (bool) {
        uint256 index = marketIndices[candidate];
        if (index == 0) {
            return markets[0] == candidate;
        }
        return true;
    }

    function setOracleMaturityWindow(uint256 _oracleMaturityWindow) public onlyOwner {
        oracleMaturityWindow = _oracleMaturityWindow;
        emit OracleMaturityWindowChanged(_oracleMaturityWindow);
    }

    function setExerciseWindow(uint256 _exerciseWindow) public onlyOwner {
        exerciseWindow = _exerciseWindow;
        emit ExerciseWindowChanged(_exerciseWindow);
    }

    function setPoolFee(uint256 _poolFee) public onlyOwner {
        require(_poolFee + creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        poolFee = _poolFee;
        emit PoolFeeChanged(_poolFee);
    }

    function setCreatorFee(uint256 _creatorFee) public onlyOwner {
        require(poolFee + _creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
        creatorFee = _creatorFee;
        emit CreatorFeeChanged(_creatorFee);
    }

    function setRefundFee(uint256 _refundFee) public onlyOwner {
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        refundFee = _refundFee;
        emit RefundFeeChanged(_refundFee);
    }

    function createMarket(
        uint256 endOfBidding, uint256 maturity,
        bytes32 oracleKey, uint256 targetPrice,
        uint256 longBid, uint256 shortBid
    )
        external
        returns (address)
    {
        BinaryOptionMarket market = new BinaryOptionMarket(
            address(resolver),
            endOfBidding,
            maturity,
            oracleKey,
            targetPrice,
            oracleMaturityWindow,
            exerciseWindow,
            msg.sender, longBid, shortBid,
            poolFee, creatorFee, refundFee);

        market.setResolverAndSyncCache(resolver);

        marketIndices[address(market)] = markets.length;
        markets.push(address(market));

        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the factory doesn't know its address in order to allow it permission.
        totalDeposited = totalDeposited.add(longBid.add(shortBid));
        synthsUSD().transferFrom(msg.sender, address(market), longBid.add(shortBid));

        emit BinaryOptionMarketCreated(address(market), msg.sender);
        return address(market);
    }

    function destroyMarket(address market) external {
        require(_isKnownMarket(market), "Market unknown.");
        require(BinaryOptionMarket(market).destructible(), "Market cannot be destroyed yet.");
        require(BinaryOptionMarket(market).creator() == msg.sender, "Market can only be destroyed by its creator.");

        // The market itself handles decrementing the total deposits.
        BinaryOptionMarket(market).selfDestruct(msg.sender);

        // Replace the removed element with the last element of the list.
        // Note that we required that the market is known, which guarantees
        // its index is defined and that the list of markets is not empty.
        uint256 index = marketIndices[market];
        uint256 lastIndex = markets.length.sub(1);
        if (index != lastIndex) {
            // No need to shift the last element if it is the one we want to delete.
            address shiftedAddress = markets[lastIndex];
            markets[index] = shiftedAddress;
            marketIndices[shiftedAddress] = index;
        }
        markets.pop();
        delete marketIndices[market];

        emit BinaryOptionMarketDestroyed(market);
    }

    function incrementTotalDeposited(uint256 delta) external onlyKnownMarkets {
        totalDeposited = totalDeposited.add(delta);
    }

    // NOTE: As individual market debt is not tracked here, the underlying markets
    //       need to be careful never to subtract more debt than they added.
    //       This can't be enforced without additional state/communication overhead.
    function decrementTotalDeposited(uint256 delta) external onlyKnownMarkets {
        totalDeposited = totalDeposited.sub(delta);
    }

    modifier onlyKnownMarkets() {
        require(_isKnownMarket(msg.sender), "Permitted only for known markets.");
        _;
    }

    event BinaryOptionMarketCreated(address market, address indexed creator);
    event BinaryOptionMarketDestroyed(address market);
    event OracleMaturityWindowChanged(uint256 duration);
    event ExerciseWindowChanged(uint256 duration);
    event PoolFeeChanged(uint256 fee);
    event CreatorFeeChanged(uint256 fee);
    event RefundFeeChanged(uint256 fee);
}
