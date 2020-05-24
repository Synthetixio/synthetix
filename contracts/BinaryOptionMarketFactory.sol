pragma solidity ^0.5.16;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISynth.sol";

// TODO: Pausable via system status -- this will also pause markets if they cannot update debt (but options will still be able to be exercised)

contract BinaryOptionMarketFactory is Owned, MixinResolver {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;

    /* ========== STATE VARIABLES ========== */

    uint256 public oracleMaturityWindow; // Prices can be used if they were last updated within this duration of a market's maturity date.
    uint256 public exerciseDuration; // The duration a market stays open after resolution for options to be exercised.
    uint256 public creatorDestructionDuration; // The duration a market is exclusively available to its owner to be cleaned up, before the public may do so.

    uint256 public poolFee; // The percentage fee remitted to the fee pool from new markets.
    uint256 public creatorFee; // The percentage fee remitted to the creators of new markets.
    uint256 public refundFee; // The percentage fee that remains in a new market if a position is refunded.

    uint256 public minimumInitialLiquidity; // The value of tokens a creator must initially supply to create a market.

    uint256 public totalDeposited; // The sum of debt from all binary option markets.

    address[] public markets; // An unordered list of the currently active markets.
    mapping(address => uint256) private marketIndices;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_SYNTHSUSD
    ];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner, address _resolver,
        uint256 _oracleMaturityWindow, uint256 _exerciseDuration, uint256 _creatorDestructionDuration,
        uint256 _minimumInitialLiquidity,
        uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
    {
        // Temporarily change the owner so that the setters don't revert.
        owner = msg.sender;
        setExerciseDuration(_exerciseDuration);
        setCreatorDestructionDuration(_creatorDestructionDuration);
        setOracleMaturityWindow(_oracleMaturityWindow);
        setMinimumInitialLiquidity(_minimumInitialLiquidity);
        setPoolFee(_poolFee);
        setCreatorFee(_creatorFee);
        setRefundFee(_refundFee);
        owner = _owner;
    }

    /* ========== VIEWS ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function sUSD() public view returns (ISynth) {
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

    function publiclyDestructibleTime(address market) public view returns (uint256) {
        return BinaryOptionMarket(market).destruction().add(creatorDestructionDuration);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setOracleMaturityWindow(uint256 _oracleMaturityWindow) public onlyOwner {
        oracleMaturityWindow = _oracleMaturityWindow;
        emit OracleMaturityWindowChanged(_oracleMaturityWindow);
    }

    function setExerciseDuration(uint256 _exerciseDuration) public onlyOwner {
        exerciseDuration = _exerciseDuration;
        emit ExerciseDurationChanged(_exerciseDuration);
    }

    function setCreatorDestructionDuration(uint256 _creatorDestructionDuration) public onlyOwner {
        creatorDestructionDuration = _creatorDestructionDuration;
        emit CreatorDestructionDurationChanged(_creatorDestructionDuration);
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

    function setMinimumInitialLiquidity(uint256 _minimumInitialLiquidity) public onlyOwner {
        minimumInitialLiquidity = _minimumInitialLiquidity;
        emit MinimumInitialLiquidityChanged(_minimumInitialLiquidity);
    }

    /* ---------- Deposit Management ---------- */

    function incrementTotalDeposited(uint256 delta) external onlyKnownMarkets {
        systemStatus().requireSystemActive();
        totalDeposited = totalDeposited.add(delta);
    }

    function decrementTotalDeposited(uint256 delta) external onlyKnownMarkets {
        systemStatus().requireSystemActive();
        // NOTE: As individual market debt is not tracked here, the underlying markets
        //       need to be careful never to subtract more debt than they added.
        //       This can't be enforced without additional state/communication overhead.
        totalDeposited = totalDeposited.sub(delta);
    }

    /* ---------- Market Creation/Destruction ---------- */

    function createMarket(
        uint256 endOfBidding, uint256 maturity,
        bytes32 oracleKey, uint256 targetPrice,
        uint256 longBid, uint256 shortBid
    )
        external
        returns (address)
    {
        systemStatus().requireSystemActive();

        // The market itself validates the minimum initial liquidity requirement.
        BinaryOptionMarket market = new BinaryOptionMarket(
            address(resolver),
            endOfBidding,
            maturity,
            maturity.add(exerciseDuration),
            oracleKey,
            targetPrice,
            oracleMaturityWindow,
            minimumInitialLiquidity,
            msg.sender, longBid, shortBid,
            poolFee, creatorFee, refundFee);

        market.setResolverAndSyncCache(resolver);

        marketIndices[address(market)] = markets.length;
        markets.push(address(market));

        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the factory doesn't know its address in order to grant it permission.
        uint256 initialDeposit = longBid.add(shortBid);
        totalDeposited = totalDeposited.add(initialDeposit);
        sUSD().transferFrom(msg.sender, address(market), initialDeposit);

        emit BinaryOptionMarketCreated(address(market), msg.sender, oracleKey, targetPrice, endOfBidding, maturity);
        return address(market);
    }

    function destroyMarket(address market) external {
        systemStatus().requireSystemActive();

        require(_isKnownMarket(market), "Market unknown.");
        require(BinaryOptionMarket(market).phase() == BinaryOptionMarket.Phase.Destruction, "Market cannot be destroyed yet.");
        // Only check if the caller is the market creator if the market cannot be destroyed by anyone.
        if (now < publiclyDestructibleTime(market)) {
            require(BinaryOptionMarket(market).creator() == msg.sender, "Still within creator exclusive destruction period.");
        }

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

        emit BinaryOptionMarketDestroyed(market, msg.sender);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyKnownMarkets() {
        require(_isKnownMarket(msg.sender), "Permitted only for known markets.");
        _;
    }

    /* ========== EVENTS ========== */

    event BinaryOptionMarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint256 targetPrice, uint256 endOfBidding, uint256 maturity);
    event BinaryOptionMarketDestroyed(address market, address indexed destroyer);
    event OracleMaturityWindowChanged(uint256 duration);
    event ExerciseDurationChanged(uint256 duration);
    event CreatorDestructionDurationChanged(uint256 duration);
    event MinimumInitialLiquidityChanged(uint256 value);
    event PoolFeeChanged(uint256 fee);
    event CreatorFeeChanged(uint256 fee);
    event RefundFeeChanged(uint256 fee);
}
