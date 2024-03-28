pragma solidity ^0.5.16;

// Inheritence
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IDynamicSynthRedeemer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";

contract DynamicSynthRedeemer is Owned, IDynamicSynthRedeemer, MixinResolver {
    using SafeDecimalMath for uint;

    // Rate applied to chainlink price for redemptions
    uint private _discountRate;

    bytes32 public constant CONTRACT_NAME = "DynamicSynthRedeemer";

    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {
        _discountRate = SafeDecimalMath.unit();
    }

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](3);
        addresses[0] = CONTRACT_ISSUER;
        addresses[1] = CONTRACT_SYNTHSUSD;
        addresses[2] = CONTRACT_EXRATES;
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function discountRate() external view returns (uint) {
        return _discountRate;
    }

    function setDiscountRate(uint newRate) external onlyOwner {
        require(newRate >= 0, "Invalid rate");
        _discountRate = newRate;
        emit DiscountRateUpdated(_discountRate);
    }

    function redeemAll(IERC20[] calldata synthProxies, bytes32[] calldata currencyKeys) external {
        for (uint i = 0; i < synthProxies.length; i++) {
            _redeem(synthProxies[i], synthProxies[i].balanceOf(msg.sender), currencyKeys[i]);
        }
    }

    function redeem(IERC20 synthProxy, bytes32 currencyKey) external {
        _redeem(synthProxy, synthProxy.balanceOf(msg.sender), currencyKey);
    }

    function redeemPartial(
        IERC20 synthProxy,
        uint amountOfSynth,
        bytes32 currencyKey
    ) external {
        // technically this check isn't necessary - Synth.burn would fail due to safe sub,
        // but this is a useful error message to the user
        require(synthProxy.balanceOf(msg.sender) >= amountOfSynth, "Insufficient balance");
        _redeem(synthProxy, amountOfSynth, currencyKey);
    }

    function _redeem(
        IERC20 synthProxy,
        uint amountOfSynth,
        bytes32 currencyKey
    ) internal {
        uint rateToRedeem = exchangeRates().rateForCurrency(currencyKey).multiplyDecimalRound(_discountRate);
        require(rateToRedeem > 0, "Synth not redeemable");
        require(amountOfSynth > 0, "No balance of synth to redeem");
        issuer().burnForRedemption(address(synthProxy), msg.sender, amountOfSynth);
        uint amountInsUSD = amountOfSynth.multiplyDecimal(rateToRedeem);
        sUSD().transfer(msg.sender, amountInsUSD);
        emit SynthRedeemed(address(synthProxy), msg.sender, amountOfSynth, amountInsUSD);
    }

    event DiscountRateUpdated(uint discountRate);
    event SynthRedeemed(address synth, address account, uint amountOfSynth, uint amountInsUSD);
}
