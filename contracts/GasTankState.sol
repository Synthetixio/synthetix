pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IGasTankState.sol";


contract GasTankState is Owned, MixinResolver, IGasTankState {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== STATE VARIABLES ========== */

    mapping(address => uint) public deposits;
    mapping(address => uint) public maxGasPrices;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_GASTANK = "GasTank";

    bytes32[24] internal addressesToCache = [CONTRACT_GASTANK];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */

    function _toPayable(address _address) internal pure returns (address payable) {
        return address(uint160(_address));
    }

    /* ---------- Related Contracts ---------- */

    function _gasTank() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_GASTANK, "Missing GasTank address");
    }

    /* ---------- GasTankState Information ---------- */

    function balanceOf(address _account) external view returns (uint) {
        return deposits[_account];
    }

    function maxGasPriceOf(address _account) external view returns (uint) {
        return maxGasPrices[_account];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addDeposit(address _depositor, uint _amount) external {
        deposits[_depositor] = deposits[_depositor].add(_amount);
        emit DepositAdded(_depositor, _amount);
    }

    function subtractFromDeposit(address _depositor, uint _amount) external {
        deposits[_depositor] = deposits[_depositor].sub(_amount);
        address payable recipient = _toPayable(address(_gasTank()));
        recipient.transfer(_amount);
        emit DepositSubtracted(_depositor, _amount);
    }

    function setMaxGasPrice(address _account, uint _gasPrice) external {
        maxGasPrices[_account] = _gasPrice;
        emit MaxGasPriceUpdated(_account, _gasPrice);
    }

    /* ========== EVENTS ========== */

    event DepositAdded(address indexed depositor, uint amount);
    event DepositSubtracted(address indexed depositor, uint amount);
    event MaxGasPriceUpdated(address indexed account, uint amount);
}
