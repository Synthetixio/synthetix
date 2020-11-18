pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./AddressListLib.sol";

// Internal references
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/ISynth.sol";


contract FuturesMarketManager is Owned, MixinResolver {
    using SafeMath for uint;
    using AddressListLib for AddressListLib.AddressList;

    /* ========== STATE VARIABLES ========== */

    AddressListLib.AddressList internal _markets;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] internal _addressesToCache = [CONTRACT_SYNTHSUSD];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, _addressesToCache) {}

    /* ========== VIEWS ========== */

    function _sUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD"));
    }

    function markets(uint index, uint pageSize) external view returns (address[] memory) {
        return _markets.getPage(index, pageSize);
    }

    // TODO: Plug this into total system debt calculation
    // TODO: Caching
    function totalDebt() external view returns (uint debt, bool isInvalid) {
        uint total;
        bool anyIsInvalid;
        uint numMarkets = _markets.elements.length;
        for (uint i; i < numMarkets; i++) {
            (uint marketDebt, bool invalid) = IFuturesMarket(_markets.elements[i]).marketDebt();
            total = total.add(marketDebt);
            anyIsInvalid = anyIsInvalid || invalid;
        }
        return (total, anyIsInvalid);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addMarket(address market) external onlyOwner {
        require(!_markets.contains(market), "Market already exists");
        _markets.push(market);
        emit MarketAdded(market);
    }

    function removeMarket(address market) external onlyOwner {
        _markets.remove(market);
        emit MarketRemoved(market);
    }

    function issueSUSD(address account, uint amount) external onlyMarkets(msg.sender) {
        _sUSD().issue(account, amount);
    }

    function burnSUSD(address account, uint amount) external onlyMarkets(msg.sender) {
        _sUSD().burn(account, amount);
    }

    /* ========== MODIFIERS ========== */

    function _requireIsMarket(address sender) internal view {
        require(_markets.contains(sender), "Sender is not a market");
    }

    modifier onlyMarkets(address sender) {
        _requireIsMarket(sender);
        _;
    }

    /* ========== EVENTS ========== */

    event MarketAdded(address market);
    event MarketRemoved(address market);
}
