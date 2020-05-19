pragma solidity ^0.5.16;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";
import "./interfaces/ISynth.sol";

// TODO: System status?
// TODO: Pausable
// TODO: Proxify
// TODO: Destruction

contract BinaryOptionMarketFactory is Owned, MixinResolver {
    using SafeMath for uint;

    uint256 public oracleMaturityWindow; // Prices are valid if they were last updated within this duration of the maturity date.

    uint256 public poolFee; // The percentage fee remitted to the fee pool from new markets.
    uint256 public creatorFee; // The percentage fee remitted to the creators of new markets.
    uint256 public refundFee; // The percentage fee that remains in a new market if a position is refunded.

    BinaryOptionMarket[] public activeMarkets; // An unordered list of the currently active markets.
    mapping(address => bool) public isActiveMarket;

    uint256 public totalDeposited; // The sum of debt from all binary option markets.

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHSUSD
    ];

    constructor(
        address _owner, address _resolver,
        uint256 _oracleMaturityWindow,
        uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
    {
        oracleMaturityWindow = _oracleMaturityWindow;
        poolFee = _poolFee;
        creatorFee = _creatorFee;
        refundFee = _refundFee;
    }

    function synthsUSD() public view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    function numActiveMarkets() public view returns (uint256) {
        return activeMarkets.length;
    }

    function setOracleMaturityWindow(uint256 _oracleMaturityWindow) public onlyOwner {
        oracleMaturityWindow = _oracleMaturityWindow;
    }

    function setPoolFee(uint256 _poolFee) public onlyOwner {
        poolFee = _poolFee;
        require(poolFee + creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
    }

    function setCreatorFee(uint256 _creatorFee) public onlyOwner {
        creatorFee = _creatorFee;
        require(poolFee + creatorFee < SafeDecimalMath.unit(), "Total fee must be less than 100%.");
    }

    function setRefundFee(uint256 _refundFee) public onlyOwner {
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        refundFee = _refundFee;
    }

    function createMarket(
        uint256 endOfBidding, uint256 maturity,
        bytes32 oracleKey, uint256 targetPrice,
        uint256 longBid, uint256 shortBid
    )
        external
        returns (BinaryOptionMarket)
    {
        BinaryOptionMarket market = new BinaryOptionMarket(
            address(resolver),
            endOfBidding,
            maturity,
            oracleKey,
            targetPrice,
            oracleMaturityWindow,
            msg.sender, longBid, shortBid,
            poolFee, creatorFee, refundFee);

        market.setResolverAndSyncCache(resolver);

        activeMarkets.push(market);
        isActiveMarket[address(market)] = true;

        // The debt can't be incremented in the new market's constructor because until construction is complete,
        // the factory doesn't know its address in order to allow it permission.
        totalDeposited = totalDeposited.add(longBid.add(shortBid));
        synthsUSD().transferFrom(msg.sender, address(market), longBid.add(shortBid));

        emit BinaryOptionMarketCreated(msg.sender, market);
    }

    function incrementTotalDeposited(uint256 delta) external onlyActiveMarket {
        totalDeposited = totalDeposited.add(delta);
    }

    // NOTE: As individual market debt is not tracked here, the underlying markets
    //       need to be careful never to subtract more debt than they added.
    //       This can't be enforced without additional state/communication overhead.
    function decrementTotalDeposited(uint256 delta) external onlyActiveMarket {
        totalDeposited = totalDeposited.sub(delta);
    }

    modifier onlyActiveMarket() {
        require(isActiveMarket[msg.sender], "Permitted only for active markets.");
        _;
    }

    // TODO: Augment the event with the initial asset type and parameters.
    event BinaryOptionMarketCreated(address indexed creator, BinaryOptionMarket market);
}
