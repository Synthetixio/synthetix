pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./AddressSetLib.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/IPerpsInterfacesV2.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketManager
contract FuturesMarketManager is Owned, MixinResolver, IFuturesMarketManager, IFuturesMarketManagerInternal {
    using SafeMath for uint;
    using AddressSetLib for AddressSetLib.AddressSet;

    /* ========== EVENTS ========== */

    event MarketAdded(address market, bytes32 indexed asset, bytes32 indexed marketKey);

    event MarketRemoved(address market, bytes32 indexed asset, bytes32 indexed marketKey);

    /* ========== STATE VARIABLES ========== */

    // V1 markets are independent contracts
    AddressSetLib.AddressSet internal _markets;
    mapping(bytes32 => address) public marketForKey;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 public constant CONTRACT_NAME = "FuturesMarketManager";

    bytes32 internal constant SUSD = "sUSD";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 internal constant CONTRACT_PERPSMANAGERV2 = "PerpsManagerV2";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== MODIFIERS ========== */

    modifier onlyMarketsOrPerpsManager() {
        require(_markets.contains(msg.sender) || msg.sender == address(_perpsManagerV2()), "Only markets or perps manager");
        _;
    }

    /* ========== External views ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](4);
        addresses[0] = CONTRACT_SYNTHSUSD;
        addresses[1] = CONTRACT_FEEPOOL;
        addresses[2] = CONTRACT_EXCHANGER;
        addresses[3] = CONTRACT_PERPSMANAGERV2;
    }

    ///// V1 + V2 views

    /// The number of V1 + V2 markets known to the manager
    function numMarkets() external view returns (uint) {
        return _numMarketsV1() + _perpsManagerV2().numMarkets();
    }

    /// The accumulated debt contribution of all markets in V1 + V2
    function totalDebt() external view returns (uint debt, bool isInvalid) {
        (uint debtV1, bool isInvalidV1) = _totalDebtV1();
        (uint debtV2, bool isInvalidV2) = _perpsManagerV2().totalDebt();
        return (debtV1.add(debtV2), isInvalidV1 || isInvalidV2);
    }

    /// V1 + V2 all summaries in V1 format
    function allMarketSummaries() external view returns (MarketSummaryV1[] memory) {
        MarketSummaryV1[] memory v1 = _allMarketSummariesV1();
        MarketSummaryV1[] memory v2 = _allMarketSummariesV2asV1();
        uint n1 = v1.length;
        uint n2 = v2.length;
        // combine the summaries
        MarketSummaryV1[] memory combined = new MarketSummaryV1[](n1 + n2);
        for (uint i; i < n1 + n2; i++) {
            if (i < n1) {
                combined[i] = v1[i];
            } else {
                combined[i] = v2[i - n1];
            }
        }
        return combined;
    }

    /// Is this a known market key (in V1 or V2)
    function isMarket(bytes32 marketKey) public view returns (bool) {
        return _isMarketV1(marketKey) || _perpsManagerV2().isMarket(marketKey);
    }

    ///// V1 specific views

    /// Returns slices of the list of all V1 markets
    function markets(uint index, uint pageSize) external view returns (address[] memory) {
        return _markets.getPage(index, pageSize);
    }

    /// list of all V1 markets
    function allMarketsV1() public view returns (address[] memory) {
        return _markets.getPage(0, _markets.elements.length);
    }

    /// market addresses (V1) for a given set of market key strings
    function marketsForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory) {
        return _addressesForKeys(marketKeys);
    }

    /// market summaries (V1) for a given set of market key strings
    function marketSummariesForKeysV1(bytes32[] calldata marketKeys) external view returns (MarketSummaryV1[] memory) {
        return _marketSummariesV1(_addressesForKeys(marketKeys));
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

    function _perpsManagerV2() internal view returns (IPerpsManagerV2) {
        return IPerpsManagerV2(requireAndGetAddress(CONTRACT_PERPSMANAGERV2));
    }

    ///// V1 helper views

    /// these are not exposed as external since can be duduced from the
    /// existing views and the perpsManager views

    function _numMarketsV1() internal view returns (uint) {
        return _markets.elements.length;
    }

    function _isMarketV1(bytes32 marketKey) internal view returns (bool) {
        return marketForKey[marketKey] != address(0);
    }

    function _totalDebtV1() internal view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numOfMarkets = _markets.elements.length;
        for (uint i = 0; i < numOfMarkets; i++) {
            (uint marketDebt, bool invalid) = IFuturesMarket(_markets.elements[i]).marketDebt();
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    function _allMarketSummariesV1() internal view returns (MarketSummaryV1[] memory) {
        return _marketSummariesV1(allMarketsV1());
    }

    function _addressesForKeys(bytes32[] memory marketKeys) internal view returns (address[] memory) {
        uint nMarkets = marketKeys.length;
        address[] memory results = new address[](nMarkets);
        for (uint i; i < nMarkets; i++) {
            results[i] = marketForKey[marketKeys[i]];
        }
        return results;
    }

    function _marketSummariesV1(address[] memory addresses) internal view returns (MarketSummaryV1[] memory) {
        uint nMarkets = addresses.length;
        MarketSummaryV1[] memory summaries = new MarketSummaryV1[](nMarkets);
        for (uint i; i < nMarkets; i++) {
            IFuturesMarket market = IFuturesMarket(addresses[i]);
            bytes32 marketKey = market.marketKey();
            bytes32 baseAsset = market.baseAsset();

            (uint price, bool invalid) = market.assetPrice();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummaryV1({
                version: "V1",
                market: address(market),
                baseAsset: baseAsset,
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

    /// market summaries for V2 markets in the common V1 format (that also includes market version)
    function _allMarketSummariesV2asV1() internal view returns (MarketSummaryV1[] memory) {
        IPerpsManagerV2 perpsManager = _perpsManagerV2();
        bytes32[] memory marketKeys = _perpsManagerV2().allMarkets();
        uint nMarkets = marketKeys.length;
        // V2 format
        IPerpsTypesV2.MarketSummary[] memory summariesV2 = perpsManager.marketSummaries(marketKeys);
        // V1 format
        MarketSummaryV1[] memory summaries = new MarketSummaryV1[](nMarkets);
        for (uint i; i < nMarkets; i++) {
            // create a V1 summary from the V2 one
            summaries[i] = MarketSummaryV1({
                version: "V2",
                market: address(perpsManager),
                baseAsset: summariesV2[i].baseAsset,
                marketKey: marketKeys[i],
                price: summariesV2[i].price,
                marketSize: summariesV2[i].marketSize,
                marketSkew: summariesV2[i].marketSkew,
                marketDebt: summariesV2[i].marketDebt,
                currentFundingRate: summariesV2[i].currentFundingRate,
                priceInvalid: summariesV2[i].priceInvalid
            });
        }

        return summaries;
    }

    /* ========== MUTATIVE EXTERNAL ========== */

    ///// Mutative, allowed for markets V1 or perps manager (V2)

    /// Allows a market to issue sUSD to an account when it withdraws margin.
    function issueSUSD(address account, uint amount) external onlyMarketsOrPerpsManager {
        // No settlement is required to issue synths into the target account.
        _sUSD().issue(account, amount);
    }

    /// Allows a market to burn sUSD from an account when it deposits margin.
    function burnSUSD(address account, uint amount) external onlyMarketsOrPerpsManager returns (uint postReclamationAmount) {
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

    /// Allows markets to issue exchange fees into the fee pool and notify it that this occurred.
    function payFee(uint amount) external onlyMarketsOrPerpsManager {
        IFeePool pool = _feePool();
        _sUSD().issue(pool.FEE_ADDRESS(), amount);
        pool.recordFeePaid(amount);
    }

    ///// Mutative, allowed to owner

    /// Add a list of new markets (V1). Reverts if some market key already has a market in V1 or V2.
    function addMarkets(address[] calldata marketsToAdd) external onlyOwner {
        uint numOfMarkets = marketsToAdd.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToAdd[i];
            // check doesn't exist in v1
            require(!_markets.contains(market), "Market already exists");

            bytes32 key = IFuturesMarket(market).marketKey();

            // check doesn't exist in v2
            require(!_perpsManagerV2().isMarket(key), "Market key exists in V2");

            bytes32 baseAsset = IFuturesMarket(market).baseAsset();

            require(marketForKey[key] == address(0), "Market already exists for key");
            marketForKey[key] = market;
            _markets.add(market);
            emit MarketAdded(market, baseAsset, key);
        }
    }

    /// Remove a list of V1 markets. Reverts if any market is not known to the manager.
    function removeMarkets(address[] calldata marketsToRemove) external onlyOwner {
        return _removeMarketsV1(marketsToRemove);
    }

    /// Remove the V1 markets for a given set of market keys. Reverts if any key has no associated market.
    function removeMarketsByKey(bytes32[] calldata marketKeysToRemove) external onlyOwner {
        _removeMarketsV1(_addressesForKeys(marketKeysToRemove));
    }

    /* ========== MUTATIVE INTERNAL ========== */

    function _removeMarketsV1(address[] memory marketsToRemove) internal {
        uint numOfMarkets = marketsToRemove.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToRemove[i];
            require(market != address(0), "Unknown market");

            bytes32 key = IFuturesMarket(market).marketKey();
            bytes32 baseAsset = IFuturesMarket(market).baseAsset();

            require(marketForKey[key] != address(0), "Unknown market");
            delete marketForKey[key];
            _markets.remove(market);
            emit MarketRemoved(market, baseAsset, key);
        }
    }
}
