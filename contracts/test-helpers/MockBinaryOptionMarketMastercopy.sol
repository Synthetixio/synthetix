pragma solidity ^0.5.16;

// Inheritance
import "../OwnedWithInit.sol";
import "../MixinResolver.sol";

// Internal references
import "../BinaryOptionMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarket
contract MockBinaryOptionMarketMastercopy is BinaryOptionMarket {
    constructor() public OwnedWithInit() {}

    function initialize(
        address _owner,
        IAddressResolver _resolver,
        address _creator,
        uint[2] memory _creatorLimits, // [capitalRequirement, skewLimit]
        bytes32 _oracleKey,
        uint _strikePrice,
        bool _refundsEnabled,
        uint[3] memory _times, // [biddingEnd, maturity, expiry]
        uint[2] memory _bids, // [longBid, shortBid]
        uint[3] memory _fees // [poolFee, creatorFee, refundFee]
    ) public {
        require(!initialized, "Binary Option Market already initialized");
        initialized = true;

        initOwner(_owner);

        resolver = _resolver;
        creator = _creator;
        creatorLimits = BinaryOptionMarketManager.CreatorLimits(_creatorLimits[0], _creatorLimits[1]);

        oracleDetails = OracleDetails(_oracleKey, _strikePrice, 0);
        times = Times(_times[0], _times[1], _times[2]);

        refundsEnabled = _refundsEnabled;

        (uint longBid, uint shortBid) = (_bids[0], _bids[1]);
        _checkCreatorLimits(longBid, shortBid);
        emit Bid(Side.Long, _creator, longBid);
        emit Bid(Side.Short, _creator, shortBid);

        // Note that the initial deposit of synths must be made by the manager, otherwise the contract's assumed
        // deposits will fall out of sync with its actual balance. Similarly the total system deposits must be updated in the manager.
        // A balance check isn't performed here since the manager doesn't know the address of the new contract until after it is created.
        uint initialDeposit = longBid.add(shortBid);
        deposited = initialDeposit;

        (uint poolFee, uint creatorFee) = (_fees[0], _fees[1]);
        fees = BinaryOptionMarketManager.Fees(poolFee, creatorFee, _fees[2]);
        _feeMultiplier = SafeDecimalMath.unit().sub(poolFee.add(creatorFee));

        // Compute the prices now that the fees and deposits have been set.
        _updatePrices(longBid, shortBid, initialDeposit);

        // Instantiate the options themselves
        options.long = new BinaryOption(_creator, longBid);
        options.short = new BinaryOption(_creator, shortBid);

        // Note: the ERC20 base contract does not have a constructor, so we do not have to worry
        // about initializing its state separately
    }
}
