pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./PerpsManagerV2ConfigSettersMixin.sol";
import "./interfaces/IPerpsInterfacesV2.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./Bytes32SetLib.sol";

// interfaces
import "./interfaces/IFuturesMarketManager.sol";

contract PerpsManagerV2 is PerpsManagerV2ConfigSettersMixin, IPerpsManagerV2, IPerpsManagerV2Internal {
    using SafeMath for uint;
    using Bytes32SetLib for Bytes32SetLib.Bytes32Set;

    /* ========== EVENTS ========== */

    event MarketAdded(bytes32 indexed asset, bytes32 indexed marketKey);

    event MarketRemoved(bytes32 indexed asset, bytes32 indexed marketKey);

    /* ========== STATE VARIABLES ========== */

    // V2 markets are keys into a single contract
    Bytes32SetLib.Bytes32Set internal _markets;

    bytes32 public constant CONTRACT_NAME = "PerpsManagerV2";

    bytes32 internal constant SUSD = "sUSD";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 internal constant CONTRACT_PERPSORDERSEV2 = "PerpsOrdersV2";
    bytes32 internal constant CONTRACT_FUTURESMARKETSMANAGER = "FuturesMarketManager";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public PerpsManagerV2ConfigSettersMixin(_owner, _resolver) {}

    /* ========== MODIFIERS ========== */

    modifier onlyEngine() {
        require(msg.sender == address(_perpsEngineV2Views()), "Only engine");
        _;
    }

    /* ========== External views ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsManagerV2ConfigSettersMixin.resolverAddressesRequired();
        // engine is already required in PerpsConfigSettersV2Mixin
        bytes32[] memory newAddresses = new bytes32[](2);
        newAddresses[0] = CONTRACT_PERPSORDERSEV2;
        newAddresses[1] = CONTRACT_FUTURESMARKETSMANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function numMarkets() external view returns (uint) {
        return _markets.elements.length;
    }

    function totalDebt() external view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numOfMarkets = _markets.elements.length;
        IPerpsEngineV2External perpsEngineV2 = _perpsEngineV2Views();
        for (uint i = 0; i < numOfMarkets; i++) {
            (uint marketDebt, bool invalid) = perpsEngineV2.marketDebt(_markets.elements[i]);
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    function isMarket(bytes32 marketKey) external view returns (bool) {
        return _markets.contains(marketKey);
    }

    function markets(uint index, uint pageSize) external view returns (bytes32[] memory) {
        return _markets.getPage(index, pageSize);
    }

    function allMarkets() public view returns (bytes32[] memory) {
        return _markets.getPage(0, _markets.elements.length);
    }

    function allMarketSummaries() external view returns (IPerpsTypesV2.MarketSummary[] memory) {
        return _marketSummaries(allMarkets());
    }

    function marketSummaries(bytes32[] calldata marketKeys) external view returns (IPerpsTypesV2.MarketSummary[] memory) {
        return _marketSummaries(marketKeys);
    }

    function approvedRouterAndMarket(address router, bytes32 marketKey) external view returns (bool approved) {
        // currently only the default orders router (PerpsOrdersV2) is approved
        // for any V2 market, in future upgrades additional order routers might be supported
        return router == _perpsOrdersV2() && _markets.contains(marketKey);
    }

    /* ========== Internal views ========== */

    /// V1 futures manager is the contact point between the rest of Synthetix and the perps system
    /// this is to simplify the interaction point for debt and issuance to a single contract
    /// When V1 system will be deprecated, the PerpsManager will be that contact point, which will require
    /// DebtCache (BaseDebtCache.sol) to use .totalDebt() from this contract, and sUSD (Synth.sol) to allow .issue()
    /// requests from this contract
    function _futuresManager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETSMANAGER));
    }

    function _perpsEngineV2Views() internal view returns (IPerpsEngineV2External) {
        return IPerpsEngineV2External(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    function _perpsOrdersV2() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PERPSORDERSEV2);
    }

    function _marketSummaries(bytes32[] memory marketKeys)
        internal
        view
        returns (IPerpsTypesV2.MarketSummary[] memory summaries)
    {
        uint nMarkets = marketKeys.length;
        summaries = new IPerpsTypesV2.MarketSummary[](nMarkets);
        IPerpsEngineV2External perpsEngine = _perpsEngineV2Views();
        for (uint i; i < nMarkets; i++) {
            summaries[i] = perpsEngine.marketSummary(marketKeys[i]);
        }
    }

    /* ========== MUTATIVE EXTERNAL ========== */

    ///// Mutative (engine)

    /// Allows a market to issue sUSD to an account when it withdraws margin
    function issueSUSD(address account, uint amount) external onlyEngine {
        // No settlement is required to issue synths into the target account.
        return _futuresManager().issueSUSD(account, amount);
    }

    /// Allows a market to burn sUSD from an account when it deposits margin
    function burnSUSD(address account, uint amount) external onlyEngine returns (uint postReclamationAmount) {
        return _futuresManager().burnSUSD(account, amount);
    }

    /// Allows market to issue exchange fees into the fee pool and notify it that this occurred
    function payFee(uint amount, bytes32 trackingCode) external onlyEngine {
        delete trackingCode; // unused for now, will be used after SIP 203
        return _futuresManager().payFee(amount);
    }

    ///// Mutative (owner)

    /// Note: checks V1 markets and ensures that it doesn't add a colliding marketKey
    function addMarkets(bytes32[] calldata marketKeys, bytes32[] calldata assets) external onlyOwner {
        uint numOfMarkets = marketKeys.length;
        require(marketKeys.length == assets.length, "Length of marketKeys != assets");
        IFuturesMarketManager futuresManager = IFuturesMarketManager(address(_futuresManager()));
        // iterate and add
        IPerpsEngineV2Internal engineMutative = _perpsEngineV2Mutative();
        for (uint i; i < numOfMarkets; i++) {
            bytes32 marketKey = marketKeys[i];
            bytes32 baseAsset = assets[i];

            // check doesn't exist in v2
            require(!_markets.contains(marketKey), "Market key exists");

            // check doesn't exist in v1 to prevent confusion between marketKeys (technically is possible)
            // futuresManager.isMarket check both v1 and v2, but we checked v2 locally already
            require(!futuresManager.isMarket(marketKey), "Market key exists in V1");

            // add to internal mapping
            _markets.add(marketKey);

            // initialize market in engine or check that it's already initialized with correct asset.
            // Note that this will add all preivous data for the stored market, so if this is not
            // the intention - a new marketKey should be used.
            engineMutative.ensureInitialized(marketKey, baseAsset);

            emit MarketAdded(baseAsset, marketKey);
        }
    }

    function removeMarkets(bytes32[] calldata marketKeys) external onlyOwner {
        uint numOfMarkets = marketKeys.length;
        IPerpsStorageV2External perpsStorage = _perpsEngineV2Views().stateContract();
        for (uint i; i < numOfMarkets; i++) {
            bytes32 marketKey = marketKeys[i];
            // check it was added
            require(_markets.contains(marketKey), "Unknown market");

            // remove
            // note that removing a market here still keeps its storage in PerpsStorageV2
            // and so if added again, will contain all the previous data.
            _markets.remove(marketKey);

            emit MarketRemoved(perpsStorage.marketScalars(marketKey).baseAsset, marketKey);
        }
    }
}
