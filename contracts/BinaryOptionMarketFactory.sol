pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./BinaryOptionMarket.sol";
import "./MinimalProxyFactory.sol";
// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarketfactory
contract BinaryOptionMarketFactory is MinimalProxyFactory, Owned, MixinResolver {
    /* ========== STATE VARIABLES ========== */

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_BINARYOPTIONMARKETMANAGER = "BinaryOptionMarketManager";
    bytes32 internal constant CONTRACT_BINARYOPTION_MASTERCOPY = "BinaryOptionMarketMastercopy";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public MinimalProxyFactory() Owned(_owner) MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_BINARYOPTIONMARKETMANAGER;
        addresses[1] = CONTRACT_BINARYOPTION_MASTERCOPY;
    }

    /* ---------- Related Contracts ---------- */

    function _manager() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_BINARYOPTIONMARKETMANAGER);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _binaryOptionMastercopy() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_BINARYOPTION_MASTERCOPY);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function createMarket(
        address creator,
        uint[2] calldata creatorLimits,
        bytes32 oracleKey,
        uint strikePrice,
        bool refundsEnabled,
        uint[3] calldata times, // [biddingEnd, maturity, expiry]
        uint[2] calldata bids, // [longBid, shortBid]
        uint[3] calldata fees // [poolFee, creatorFee, refundFee]
    ) external returns (BinaryOptionMarket) {
        address manager = _manager();
        require(address(manager) == msg.sender, "Only permitted by the manager.");

        BinaryOptionMarket bom =
            BinaryOptionMarket(_cloneAsMinimalProxy(_binaryOptionMastercopy(), "Could not create a Binary Option Market"));
        bom.initOwner(manager);
        bom.initResolver(address(resolver));
        bom.initialize(creator, creatorLimits, oracleKey, strikePrice, refundsEnabled, times, bids, fees);
        return bom;
    }
}
