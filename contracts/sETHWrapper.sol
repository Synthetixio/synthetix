pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

contract sETHWrapper is Owned, MixinSystemSettings {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== ENCODED NAMES ========== */
    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";
    bytes32 internal constant SNX = "SNX";

    // Flexible storage names
    bytes32 public constant CONTRACT_NAME = "sETHWrapper";
    bytes32 internal constant MAX_ETH = "maxETH";
    bytes32 internal constant MINT_FEE_RATE = "mintFeeRate";
    bytes32 internal constant BURN_FEE_RATE = "burnFeeRate";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);

        return combineArrays(existingAddresses, newAddresses);
    }

    function mint() external payable {}

    function burn(uint amount) external {}

    // ========== VIEWS ==========

    function maxETH() public view returns (uint256) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, MAX_ETH);
    }

    function mintFeeRate() public view returns (uint256) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, MINT_FEE_RATE);
    }

    function burnFeeRate() public view returns (uint256) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, BURN_FEE_RATE);
    }

    // ========== RESTRICTED ==========

    function setMaxETH(uint _maxETH) external onlyOwner {
        flexibleStorage().setUIntValue(CONTRACT_NAME, MAX_ETH, _maxETH);

        emit MaxETHUpdated(_maxETH);
    }

    function setMintFeeRate(uint _rate) external onlyOwner {
        flexibleStorage().setUIntValue(CONTRACT_NAME, MINT_FEE_RATE, _rate);

        emit MintFeeRateUpdated(_rate);
    }

    function setBurnFeeRate(uint _rate) external onlyOwner {
        flexibleStorage().setUIntValue(CONTRACT_NAME, BURN_FEE_RATE, _rate);

        emit BurnFeeRateUpdated(_rate);
    }

    /* ========== EVENTS ========== */
    event MaxETHUpdated(uint rate);
    event MintFeeRateUpdated(uint rate);
    event BurnFeeRateUpdated(uint rate);
}
