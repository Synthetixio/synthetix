pragma solidity ^0.8.9;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./Proxyable.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./AddressSetLib.sol";

// Internal references
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IERC20.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketManager
contract FuturesMarketManager is Owned, MixinResolver, Proxyable, IFuturesMarketManager {
    using SafeMath for uint;
    using AddressSetLib for AddressSetLib.AddressSet;

    /* ========== STATE VARIABLES ========== */

    AddressSetLib.AddressSet internal _markets;
    mapping(bytes32 => address) public marketForAsset;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 internal constant SUSD = "sUSD";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) Owned(_owner) Proxyable(_proxy) MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        addresses = new bytes32[](3);
        addresses[0] = CONTRACT_SYNTHSUSD;
        addresses[1] = CONTRACT_FEEPOOL;
        addresses[2] = CONTRACT_EXCHANGER;
    }

    function _sUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    /*
     * Returns slices of the list of all markets.
     */
    function markets(uint index, uint pageSize) external view returns (address[] memory) {
        return _markets.getPage(index, pageSize);
    }

    /*
     * The number of markets known to the manager.
     */
    function numMarkets() external view returns (uint) {
        return _markets.elements.length;
    }

    /*
     * The list of all markets.
     */
    function allMarkets() external view returns (address[] memory) {
        return _markets.getPage(0, _markets.elements.length);
    }

    function _marketsForAssets(bytes32[] memory assets) internal view returns (address[] memory) {
        uint numAssets = assets.length;
        address[] memory results = new address[](numAssets);
        for (uint i; i < numAssets; i++) {
            results[i] = marketForAsset[assets[i]];
        }
        return results;
    }

    /*
     * The market addresses for a given set of asset strings.
     */
    function marketsForAssets(bytes32[] calldata assets) external view returns (address[] memory) {
        return _marketsForAssets(assets);
    }

    /*
     * The accumulated debt contribution of all futures markets.
     */
    function totalDebt() external view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numOfMarkets = _markets.elements.length;
        for (uint i; i < numOfMarkets; i++) {
            (uint marketDebt, bool invalid) = IFuturesMarket(_markets.elements[i]).marketDebt();
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /*
     * Add a set of new markets. Reverts if some market's asset already has a market.
     */
    function addMarkets(address[] calldata marketsToAdd) external optionalProxy_onlyOwner {
        uint numOfMarkets = marketsToAdd.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToAdd[i];
            require(!_markets.contains(market), "Market already exists");

            bytes32 key = IFuturesMarket(market).baseAsset();
            require(marketForAsset[key] == address(0), "Market already exists for this asset");
            marketForAsset[key] = market;
            _markets.add(market);
            emitMarketAdded(market, key);
        }
    }

    function _removeMarkets(address[] memory marketsToRemove) internal {
        uint numOfMarkets = marketsToRemove.length;
        for (uint i; i < numOfMarkets; i++) {
            address market = marketsToRemove[i];
            require(market != address(0), "Unknown market");

            bytes32 key = IFuturesMarket(market).baseAsset();
            require(marketForAsset[key] != address(0), "Unknown market");
            delete marketForAsset[key];
            _markets.remove(market);
            emitMarketRemoved(market, key);
        }
    }

    /*
     * Remove a set of markets. Reverts if any market is not known to the manager.
     */
    function removeMarkets(address[] calldata marketsToRemove) external optionalProxy_onlyOwner {
        return _removeMarkets(marketsToRemove);
    }

    /*
     * Remove the markets for a given set of assets. Reverts if any asset has no associated market.
     */
    function removeMarketsByAsset(bytes32[] calldata assetsToRemove) external optionalProxy_onlyOwner {
        _removeMarkets(_marketsForAssets(assetsToRemove));
    }

    /*
     * Allows a market to issue sUSD to an account when it withdraws margin.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function issueSUSD(address account, uint amount) external onlyMarkets {
        // No settlement is required to issue synths into the target account.
        _sUSD().issue(account, amount);
    }

    /*
     * Allows a market to burn sUSD from an account when it deposits margin.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function burnSUSD(address account, uint amount) external onlyMarkets returns (uint postReclamationAmount) {
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

    /*
     * Allows markets to issue exchange fees into the fee pool and notify it that this occurred.
     * This function is not callable through the proxy, only underlying contracts interact;
     * it reverts if not called by a known market.
     */
    function payFee(uint amount) external onlyMarkets {
        IFeePool pool = _feePool();
        _sUSD().issue(pool.FEE_ADDRESS(), amount);
        pool.recordFeePaid(amount);
    }

    /* ========== MODIFIERS ========== */

    function _requireIsMarket() internal view {
        require(_markets.contains(messageSender) || _markets.contains(msg.sender), "Permitted only for markets");
    }

    modifier onlyMarkets() {
        _requireIsMarket();
        _;
    }

    /* ========== EVENTS ========== */

    event MarketAdded(address market, bytes32 indexed asset);
    bytes32 internal constant MARKETADDED_SIG = keccak256("MarketAdded(address,bytes32)");

    function emitMarketAdded(address market, bytes32 asset) internal {
        proxy._emit(abi.encode(market), 2, MARKETADDED_SIG, asset, 0, 0);
    }

    event MarketRemoved(address market, bytes32 indexed asset);
    bytes32 internal constant MARKETREMOVED_SIG = keccak256("MarketRemoved(address,bytes32)");

    function emitMarketRemoved(address market, bytes32 asset) internal {
        proxy._emit(abi.encode(market), 2, MARKETREMOVED_SIG, asset, 0, 0);
    }
}
