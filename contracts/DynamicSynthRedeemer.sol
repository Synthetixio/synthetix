pragma solidity ^0.5.16;

// Inheritence
import "./Owned.sol";
import "./Proxyable.sol";
import "./MixinResolver.sol";
import "./interfaces/IDynamicSynthRedeemer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";

contract DynamicSynthRedeemer is Owned, IDynamicSynthRedeemer, MixinResolver {
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "DynamicSynthRedeemer";

    uint public discountRate;
    bool public redemptionActive;

    bytes32 internal constant sUSD = "sUSD";

    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {
        discountRate = SafeDecimalMath.unit();
    }

    /* ========== RESOLVER CONFIG ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_ISSUER;
        addresses[1] = CONTRACT_EXRATES;
    }

    /* ========== INTERNAL VIEWS ========== */

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _redeemingActive() internal view {
        require(redemptionActive, "Redemption deactivated");
    }

    /* ========== EXTERNAL VIEWS ========== */

    function getDiscountRate() external view returns (uint) {
        return discountRate;
    }

    /* ========== INTERNAL HELPERS ========== */

    function _proxyAddressForKey(bytes32 currencyKey) internal returns (address) {
        address synth = address(_issuer().synths(currencyKey));
        require(synth != address(0), "Invalid synth");
        return address(Proxyable(synth).proxy());
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function redeemAll(bytes32[] calldata currencyKeys) external requireRedemptionActive {
        for (uint i = 0; i < currencyKeys.length; i++) {
            address synthProxy = _proxyAddressForKey(currencyKeys[i]);
            _redeem(synthProxy, currencyKeys[i], IERC20(synthProxy).balanceOf(msg.sender));
        }
    }

    function redeem(bytes32 currencyKey) external requireRedemptionActive {
        address synthProxy = _proxyAddressForKey(currencyKey);
        _redeem(synthProxy, currencyKey, IERC20(synthProxy).balanceOf(msg.sender));
    }

    function redeemPartial(bytes32 currencyKey, uint amountOfSynth) external requireRedemptionActive {
        address synthProxy = _proxyAddressForKey(currencyKey);
        // technically this check isn't necessary - Synth.burn would fail due to safe sub,
        // but this is a useful error message to the user
        require(IERC20(synthProxy).balanceOf(msg.sender) >= amountOfSynth, "Insufficient balance");
        _redeem(synthProxy, currencyKey, amountOfSynth);
    }

    function _redeem(
        address synthProxy,
        bytes32 currencyKey,
        uint amountOfSynth
    ) internal {
        require(amountOfSynth > 0, "No balance of synth to redeem");
        require(currencyKey != sUSD, "Cannot redeem sUSD");

        // Discount rate applied to chainlink price for dynamic redemptions
        (uint rate, bool invalid) = _exchangeRates().rateAndInvalid(currencyKey);
        uint rateToRedeem = rate.multiplyDecimalRound(discountRate);
        require(rateToRedeem > 0 && !invalid, "Synth not redeemable");

        uint amountInsUSD = amountOfSynth.multiplyDecimalRound(rateToRedeem);
        _issuer().burnAndIssueSynthsWithoutDebtCache(msg.sender, currencyKey, amountOfSynth, amountInsUSD);

        emit SynthRedeemed(synthProxy, msg.sender, amountOfSynth, amountInsUSD);
    }

    /* ========== MODIFIERS ========== */

    modifier requireRedemptionActive() {
        _redeemingActive();
        _;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setDiscountRate(uint _newRate) external onlyOwner {
        require(_newRate >= 0 && _newRate <= SafeDecimalMath.unit(), "Invalid rate");
        discountRate = _newRate;
        emit DiscountRateUpdated(_newRate);
    }

    function suspendRedemption() external onlyOwner {
        require(redemptionActive, "Redemption suspended");
        redemptionActive = false;
        emit RedemptionSuspended();
    }

    function resumeRedemption() external onlyOwner {
        require(!redemptionActive, "Redemption not suspended");
        redemptionActive = true;
        emit RedemptionResumed();
    }

    /* ========== EVENTS ========== */

    event RedemptionSuspended();
    event RedemptionResumed();
    event DiscountRateUpdated(uint discountRate);
    event SynthRedeemed(address synth, address account, uint amountOfSynth, uint amountInsUSD);
}
