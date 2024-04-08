pragma solidity ^0.5.16;

// Inheritence
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IDynamicSynthRedeemer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynth.sol";

interface IProxy {
    function target() external view returns (address);
}

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

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function redeemingActive() internal view {
        require(redemptionActive, "Redemption deactivated");
    }

    /* ========== VIEWS ========== */

    function getDiscountRate() external view returns (uint) {
        return discountRate;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function redeemAll(address[] calldata synthProxies) external requireRedemptionActive {
        for (uint i = 0; i < synthProxies.length; i++) {
            _redeem(synthProxies[i], IERC20(synthProxies[i]).balanceOf(msg.sender));
        }
    }

    function redeem(address synthProxy) external requireRedemptionActive {
        _redeem(synthProxy, IERC20(synthProxy).balanceOf(msg.sender));
    }

    function redeemPartial(address synthProxy, uint amountOfSynth) external requireRedemptionActive {
        // technically this check isn't necessary - Synth.burn would fail due to safe sub,
        // but this is a useful error message to the user
        require(IERC20(synthProxy).balanceOf(msg.sender) >= amountOfSynth, "Insufficient balance");
        _redeem(synthProxy, amountOfSynth);
    }

    function _redeem(address synthProxy, uint amountOfSynth) internal {
        bytes32 currencyKey = ISynth(IProxy(synthProxy).target()).currencyKey();
        require(currencyKey != sUSD, "Cannot redeem sUSD");

        // Discount rate applied to chainlink price for dynamic redemptions
        uint rateToRedeem = exchangeRates().rateForCurrency(currencyKey).multiplyDecimalRound(discountRate);
        require(rateToRedeem > 0, "Synth not redeemable");
        require(amountOfSynth > 0, "No balance of synth to redeem");

        issuer().burnForRedemption(address(synthProxy), msg.sender, amountOfSynth);
        uint amountInsUSD = amountOfSynth.multiplyDecimalRound(rateToRedeem);
        issuer().issueSynthsWithoutDebt(sUSD, msg.sender, amountInsUSD);

        emit SynthRedeemed(address(synthProxy), msg.sender, amountOfSynth, amountInsUSD);
    }

    /* ========== MODIFIERS ========== */

    modifier requireRedemptionActive() {
        redeemingActive();
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
