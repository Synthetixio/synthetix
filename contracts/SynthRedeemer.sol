pragma solidity ^0.5.16;

// Inheritence
import "./MixinResolver.sol";
import "./interfaces/ISynthRedeemer.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynth.sol";

contract SynthRedeemer is ISynthRedeemer, MixinResolver {
    using SafeDecimalMath for uint;

    mapping(address => uint) public redemptions;

    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    constructor(address _resolver) public MixinResolver(_resolver) {}

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_ISSUER;
        addresses[1] = CONTRACT_SYNTHSUSD;
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function totalSupply(IERC20 synthProxy) public view returns (uint supplyInsUSD) {
        supplyInsUSD = synthProxy.totalSupply().multiplyDecimal(redemptions[address(synthProxy)]);
    }

    function balanceOf(IERC20 synthProxy, address account) external view returns (uint balanceInsUSD) {
        balanceInsUSD = synthProxy.balanceOf(account).multiplyDecimal(redemptions[address(synthProxy)]);
    }

    function redeem(IERC20 synthProxy) external {
        redeemPartial(synthProxy, synthProxy.balanceOf(msg.sender));
    }

    function redeemPartial(IERC20 synthProxy, uint amountOfSynth) public {
        uint rateToRedeem = redemptions[address(synthProxy)];
        require(rateToRedeem > 0, "Synth not redeemable");
        require(amountOfSynth > 0, "No balance of synth to redeem");
        require(synthProxy.balanceOf(msg.sender) >= amountOfSynth, "Insufficient balance");
        _issuer().burnForRedemption(ISynth(address(synthProxy)), msg.sender, amountOfSynth);
        uint amountInsUSD = amountOfSynth.multiplyDecimal(rateToRedeem);
        _sUSD().transfer(msg.sender, amountInsUSD);
        emit SynthRedeemed(address(synthProxy), msg.sender, amountOfSynth, amountInsUSD);
    }

    function deprecate(
        ISynth synthProxy,
        uint rateToRedeem,
        uint totalSynthSupply
    ) external onlyIssuer {
        address synthProxyAddress = address(synthProxy);
        require(redemptions[synthProxyAddress] == 0, "Synth is already deprecated");
        require(rateToRedeem > 0, "No rate for synth to redeem");
        redemptions[synthProxyAddress] = rateToRedeem;
        // Note: we must check the totalSupply after setting the redemption as it uses the persisted redemption rate for its calculation
        require(_sUSD().balanceOf(address(this)) >= totalSupply(IERC20(address(synthProxy))), "sUSD must first be supplied");
        emit SynthDeprecated(address(synthProxy), rateToRedeem, totalSynthSupply);
    }

    function requireOnlyIssuer() internal view {
        require(msg.sender == address(_issuer()), "Restricted to Issuer contract");
    }

    modifier onlyIssuer() {
        requireOnlyIssuer();
        _;
    }

    event SynthRedeemed(address synth, address account, uint amountOfSynth, uint amountInsUSD);
    event SynthDeprecated(address synth, uint rateToRedeem, uint totalSynthSupply);
}
