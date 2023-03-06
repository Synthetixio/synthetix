pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Libraries
import "./Math.sol";
import "./SafeDecimalMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract BaseDebtMigrator is Owned, MixinSystemSettings {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SafeERC20 for IERC20;

    // have to define this function like this here because contract name is required for FlexibleStorage
    function CONTRACT_NAME() public pure returns (bytes32);

    bytes32 private constant DEBT_TRANSFER_NAMESPACE = "DebtTransfer";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_EXCHANGERATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";

    /* ========== CONSTRUCTOR ========= */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== INTERNALS ========== */

    function _flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function _messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES));
    }

    function _rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function _synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function _synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](6);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_REWARDESCROW;
        newAddresses[3] = CONTRACT_ISSUER;
        newAddresses[4] = CONTRACT_FLEXIBLESTORAGE;
        newAddresses[5] = CONTRACT_EXCHANGERATES;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // ==== INTERNAL FUNCTIONS ====

    function _incrementDebtTransferCounter(
        bytes32 group,
        bytes32 currencyKey,
        uint amount
    ) internal {
        bytes32 key = keccak256(abi.encodePacked(DEBT_TRANSFER_NAMESPACE, group, currencyKey));

        uint currentSynths = flexibleStorage().getUIntValue(CONTRACT_NAME(), key);

        flexibleStorage().setUIntValue(CONTRACT_NAME(), key, currentSynths.add(amount));
    }

    function _sumTransferAmounts(bytes32 group) internal view returns (uint sum) {
        // get list of synths from issuer
        bytes32[] memory currencyKeys = _issuer().availableCurrencyKeys();

        // get all synth rates
        (uint[] memory rates, bool isInvalid) = _exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);

        require(!isInvalid, "Rates are invalid");

        // get all values
        bytes32[] memory transferAmountKeys = new bytes32[](currencyKeys.length);
        for (uint i = 0; i < currencyKeys.length; i++) {
            transferAmountKeys[i] = keccak256(abi.encodePacked(DEBT_TRANSFER_NAMESPACE, group, currencyKeys[i]));
        }

        uint[] memory transferAmounts = flexibleStorage().getUIntValues(CONTRACT_NAME(), transferAmountKeys);

        for (uint i = 0; i < currencyKeys.length; i++) {
            sum = sum.add(transferAmounts[i].multiplyDecimalRound(rates[i]));
        }
    }
}
