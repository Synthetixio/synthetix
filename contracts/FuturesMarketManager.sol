pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./AddressSetLib.sol";
import "./Bytes32SetLib.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/IPerpsInterfacesV2.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketManager
contract FuturesMarketManager is Owned, MixinResolver, IFuturesMarketManager, IPerpsTypesV2 {
    using SafeMath for uint;
    using AddressSetLib for AddressSetLib.AddressSet;
    using Bytes32SetLib for Bytes32SetLib.Bytes32Set;

    /* ========== EVENTS ========== */

    event MarketAddedV1(address market, bytes32 indexed asset, bytes32 indexed marketKey);

    event MarketRemovedV1(address market, bytes32 indexed asset, bytes32 indexed marketKey);

    event MarketAddedV2(bytes32 indexed asset, bytes32 indexed marketKey);

    event MarketRemovedV2(bytes32 indexed asset, bytes32 indexed marketKey);

    /* ========== STATE VARIABLES ========== */

    // V1 markets are independent contracts
    AddressSetLib.AddressSet internal _marketsV1;
    mapping(bytes32 => address) public marketV1ForKey;

    // V2 markets are keys into a single contract
    Bytes32SetLib.Bytes32Set internal _marketsV2;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 public constant CONTRACT_NAME = "FuturesMarketManager";

    bytes32 internal constant SUSD = "sUSD";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 internal constant CONTRACT_PERPSENGINEV2 = "PerpsEngineV2";
    bytes32 internal constant CONTRACT_PERPSORDERSEV2 = "PerpsOrdersV2";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== MODIFIERS ========== */

    modifier onlyMarketsOrRouters() {
        _requireIsMarketOrRouter();
        _;
    }

    function _requireIsMarketOrRouter() internal view {
        // v1 markets or v2 engine only
        require(
            msg.sender == address(_perpsOrdersV2()) || // V2 orders router
                msg.sender == address(_perpsEngineV2()) || // V2 engine
                _marketsV1.contains(msg.sender), // V1 markets
            "Only markets or routers"
        );
    }

    /* ========== External views ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](5);
        addresses[0] = CONTRACT_SYNTHSUSD;
        addresses[1] = CONTRACT_FEEPOOL;
        addresses[2] = CONTRACT_PERPSENGINEV2;
        addresses[3] = CONTRACT_PERPSORDERSEV2;
        addresses[4] = CONTRACT_EXCHANGER;
    }

    ///// V1 + V2 views
    /*
     * The number of markets known to the manager.
     */
    function numMarkets() external view returns (uint) {
        return numMarketsV1() + numMarketsV2();
    }

    /*
     * The accumulated debt contribution of all futures markets.
     */
    function totalDebt() external view returns (uint debt, bool isInvalid) {
        (uint debtV1, bool isInvalidV1) = totalDebtV1();
        (uint debtV2, bool isInvalidV2) = totalDebtV2();
        return (debtV1.add(debtV2), isInvalidV1 || isInvalidV2);
    }

    function allMarketSummaries() external view returns (MarketSummary[] memory) {
        MarketSummary[] memory v1 = allMarketSummariesV1();
        MarketSummary[] memory v2 = allMarketSummariesV2();
        uint n1 = v1.length;
        uint n2 = v2.length;
        // combine the summaries
        MarketSummary[] memory combined = new MarketSummary[](n1 + n2);
        for (uint i; i < n1 + n2; i++) {
            if (i < n1) {
                combined[i] = v1[i];
            } else {
                combined[i] = v2[i - n1];
            }
        }
        return combined;
    }

    function isMarket(bytes32 marketKey) public view returns (bool) {
        return isMarketV1(marketKey) || isMarketV2(marketKey);
    }

    ///// V1 views

    /*
     * Returns slices of the list of all markets.
     */
    function marketsV1(uint index, uint pageSize) external view returns (address[] memory) {
        return _marketsV1.getPage(index, pageSize);
    }

    function isMarketV1(bytes32 marketKey) public view returns (bool) {
        return marketV1ForKey[marketKey] != address(0);
    }

    function numMarketsV1() public view returns (uint) {
        return _marketsV1.elements.length;
    }

    function totalDebtV1() public view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numOfMarkets = _marketsV1.elements.length;
        for (uint i = 0; i < numOfMarkets; i++) {
            (uint marketDebt, bool invalid) = IFuturesMarket(_marketsV1.elements[i]).marketDebt();
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    // backwards compatibility for FuturesMarketSettings and FuturesMarketData
    function marketForKey(bytes32 marketKey) external view returns (address) {
        return marketV1ForKey[marketKey];
    }

    /*
     * The market addresses for a given set of market key strings.
     */
    function marketsV1ForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory) {
        return _addressesForKeysV1(marketKeys);
    }

    /*
     * The list of all markets.
     */
    function allMarketsV1() public view returns (address[] memory) {
        return _marketsV1.getPage(0, _marketsV1.elements.length);
    }

    function allMarketSummariesV1() public view returns (MarketSummary[] memory) {
        return _marketSummariesV1(allMarketsV1());
    }

    function marketSummariesV1(address[] calldata addresses) external view returns (MarketSummary[] memory) {
        return _marketSummariesV1(addresses);
    }

    function marketSummariesForKeysV1(bytes32[] calldata marketKeys) external view returns (MarketSummary[] memory) {
        return _marketSummariesV1(_addressesForKeysV1(marketKeys));
    }

    ///// V2 views

    function numMarketsV2() public view returns (uint) {
        return _marketsV2.elements.length;
    }

    function isMarketV2(bytes32 marketKey) public view returns (bool) {
        return _marketsV2.contains(marketKey);
    }

    function marketsV2(uint index, uint pageSize) external view returns (bytes32[] memory) {
        return _marketsV2.getPage(index, pageSize);
    }

    function allMarketsV2() public view returns (bytes32[] memory) {
        return _marketsV2.getPage(0, _marketsV2.elements.length);
    }

    function totalDebtV2() public view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numOfMarkets = _marketsV2.elements.length;
        IPerpsEngineV2External perpsEngineV2 = _perpsEngineV2Views();
        for (uint i = 0; i < numOfMarkets; i++) {
            (uint marketDebt, bool invalid) = perpsEngineV2.marketDebt(_marketsV2.elements[i]);
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    function allMarketSummariesV2() public view returns (MarketSummary[] memory) {
        return _marketSummariesV2(allMarketsV2());
    }

    function approvedRouterAndMarket(address router, bytes32 marketKey) external view returns (bool approved) {
        // currently only the default orders router (PerpsOrdersV2) is approved
        // for any V2 market, in future upgrades additional order routers might be supported
        return router == _perpsOrdersV2() && _marketsV2.contains(marketKey);
    }

    /* ========== Internal views ========== */

    ///// Addresses

    function _sUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function _perpsEngineV2() internal view returns (IPerpsEngineV2Internal) {
        return IPerpsEngineV2Internal(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    function _perpsEngineV2Views() internal view returns (IPerpsEngineV2External) {
        return IPerpsEngineV2External(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    function _perpsOrdersV2() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PERPSENGINEV2);
    }

    ///// V1 helper views
    function _addressesForKeysV1(bytes32[] memory marketKeys) internal view returns (address[] memory) {
        uint nMarkets = marketKeys.length;
        address[] memory results = new address[](nMarkets);
        for (uint i; i < nMarkets; i++) {
            results[i] = marketV1ForKey[marketKeys[i]];
        }
        return results;
    }

    function _marketSummariesV1(address[] memory addresses) internal view returns (MarketSummary[] memory) {
        uint nMarkets = addresses.length;
        MarketSummary[] memory summaries = new MarketSummary[](nMarkets);
        for (uint i; i < nMarkets; i++) {
            IFuturesMarket market = IFuturesMarket(addresses[i]);
            bytes32 marketKey = market.marketKey();
            bytes32 baseAsset = market.baseAsset();

            (uint price, bool invalid) = market.assetPrice();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummary({
                version: "V1",
                market: address(market),
                asset: baseAsset,
                marketKey: marketKey,
                price: price,
                marketSize: market.marketSize(),
                marketSkew: market.marketSkew(),
                marketDebt: debt,
                currentFundingRate: market.currentFundingRate(),
                priceInvalid: invalid
            });
        }

        return summaries;
    }

    ///// V2 helper views
    function _marketSummariesV2(bytes32[] memory marketKeys) internal view returns (MarketSummary[] memory) {
        uint nMarkets = marketKeys.length;
        MarketSummary[] memory summaries = new MarketSummary[](nMarkets);
        IPerpsEngineV2External perpsEngine = _perpsEngineV2Views();
        IPerpsStorageV2External perpsStorage = perpsEngine.storageContract();
        for (uint i; i < nMarkets; i++) {
            bytes32 marketKey = marketKeys[i];
            MarketScalars memory marketScalars = perpsStorage.marketScalars(marketKey);

            (uint price, bool invalid) = perpsEngine.assetPrice(marketKey);
            (uint debt, ) = perpsEngine.marketDebt(marketKey);

            summaries[i] = MarketSummary({
                version: "V2",
                market: address(perpsEngine),
                asset: marketScalars.baseAsset,
                marketKey: marketKey,
                price: price,
                marketSize: marketScalars.marketSize,
                marketSkew: marketScalars.marketSkew,
                marketDebt: debt,
                currentFundingRate: perpsEngine.currentFundingRate(marketKey),
                priceInvalid: invalid
            });
        }

        return summaries;
    }

    /* ========== MUTATIVE EXTERNAL ========== */

    ///// Mutative general

    /*
     * Allows a market to issue sUSD to an account when it withdraws margin.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function issueSUSD(address account, uint amount) external onlyMarketsOrRouters {
        // No settlement is required to issue synths into the target account.
        _sUSD().issue(account, amount);
    }

    /*
     * Allows a market to burn sUSD from an account when it deposits margin.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function burnSUSD(address account, uint amount) external onlyMarketsOrRouters returns (uint postReclamationAmount) {
        // We'll settle first, in order to ensure the user has sufficient balance.
        // If the settlement reduces the user's balance below the requested amount,
        // the settled remainder will be the resulting deposit.

        // Exchanger.settle ensures synth is active
        ISynth sUSD = _sUSD();
        (uint reclaimed, , ) = _exchanger().settle(account, SUSD);

        uint balanceAfter = amount;
        if (0 < reclaimed) {
            balanceAfter = IERC20(address(sUSD)).balanceOf(account);
        }

        // Reduce the value to burn if balance is insufficient after reclamation
        amount = balanceAfter < amount ? balanceAfter : amount;

        sUSD.burn(account, amount);

        return amount;
    }

    /**
     * Allows markets to issue exchange fees into the fee pool and notify it that this occurred.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function payFee(uint amount, bytes32 trackingCode) external onlyMarketsOrRouters {
        _payFee(amount, trackingCode);
    }

    ///// Mutative V1

    // backwards compatibility with futures v1
    function payFee(uint amount) external onlyMarketsOrRouters {
        _payFee(amount, bytes32(0));
    }

    /*
     * Add a set of new markets. Reverts if some market key already has a market.
     */
    function addMarketsV1(address[] memory marketsToAdd) public onlyOwner {
        uint numOfMarkets = marketsToAdd.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToAdd[i];
            // check doesn't exist in v1
            require(!_marketsV1.contains(market), "Market already exists");

            bytes32 key = IFuturesMarket(market).marketKey();

            // check doesn't exist in v2
            require(!_marketsV2.contains(key), "Market key exists in V2");

            bytes32 baseAsset = IFuturesMarket(market).baseAsset();

            require(marketV1ForKey[key] == address(0), "Market already exists for key");
            marketV1ForKey[key] = market;
            _marketsV1.add(market);
            emit MarketAddedV1(market, baseAsset, key);
        }
    }

    // backwards compatibility for V1 (e.g. migration contracts and scripts)
    function addMarkets(address[] calldata marketsToAdd) external onlyOwner {
        addMarketsV1(marketsToAdd);
    }

    /*
     * Remove a set of markets. Reverts if any market is not known to the manager.
     */
    function removeMarketsV1(address[] calldata marketsToRemove) external onlyOwner {
        return _removeMarketsV1(marketsToRemove);
    }

    /*
     * Remove the markets for a given set of market keys. Reverts if any key has no associated market.
     */
    function removeMarketsByKeyV1(bytes32[] calldata marketKeysToRemove) external onlyOwner {
        _removeMarketsV1(_addressesForKeysV1(marketKeysToRemove));
    }

    ///// Mutative V2

    function addMarketsV2(bytes32[] calldata marketKeys, bytes32[] calldata assets) external onlyOwner {
        uint numOfMarkets = marketKeys.length;
        require(marketKeys.length == assets.length, "length of marketKeys != assets");
        // iterate and add
        for (uint i; i < numOfMarkets; i++) {
            bytes32 marketKey = marketKeys[i];
            bytes32 baseAsset = assets[i];

            // check doesn't exist in v1
            require(marketV1ForKey[marketKey] == address(0), "Market key exists in V1");

            // check doesn't exist in v2
            require(!_marketsV2.contains(marketKey), "Market key exists");

            // add to internal mapping
            _marketsV2.add(marketKey);

            // initialize market in engine or check that it's already initialized with correct asset.
            // Note that this will add all preivous data for the stored market, so if this is not
            // the intention - a new marketKey should be used.
            _perpsEngineV2().initOrCheckMarket(marketKey, baseAsset);

            emit MarketAddedV2(baseAsset, marketKey);
        }
    }

    function removeMarketsV2(bytes32[] calldata marketKeys) external onlyOwner {
        uint numOfMarkets = marketKeys.length;
        IPerpsStorageV2External persStorage = _perpsEngineV2Views().storageContract();
        for (uint i; i < numOfMarkets; i++) {
            bytes32 marketKey = marketKeys[i];
            // check it was added
            require(_marketsV2.contains(marketKey), "market not found");

            // remove
            // note that removing a market here still keeps its storage in PerpsStorageV2
            // and so if added again, will contain all the previous data.
            _marketsV2.remove(marketKey);

            emit MarketRemovedV2(persStorage.marketScalars(marketKey).baseAsset, marketKey);
        }
    }

    /* ========== MUTATIVE INTERNAL ========== */

    function _removeMarketsV1(address[] memory marketsToRemove) internal {
        uint numOfMarkets = marketsToRemove.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToRemove[i];
            require(market != address(0), "Unknown market");

            bytes32 key = IFuturesMarket(market).marketKey();
            bytes32 baseAsset = IFuturesMarket(market).baseAsset();

            require(marketV1ForKey[key] != address(0), "Unknown market");
            delete marketV1ForKey[key];
            _marketsV1.remove(market);
            emit MarketRemovedV1(market, baseAsset, key);
        }
    }

    function _payFee(uint amount, bytes32 trackingCode) internal {
        delete trackingCode; // unused for now, will be used SIP 203
        IFeePool pool = _feePool();
        _sUSD().issue(pool.FEE_ADDRESS(), amount);
        pool.recordFeePaid(amount);
    }
}
