pragma solidity ^0.5.16;

// Inheritance
import "./FuturesMarketBase.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IFlexibleStorage.sol";

/**
 * Defines internal functions to send funds to a volume partner. Depends on FlexibleStorage to pull data about a partner
 */
contract MixinPartner is MixinResolver {
    bytes32 private constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    bytes32 private constant CONTRACT_PARTNERREGISTRY = "PartnerRegistry";

    // sUSD currencyKey. Fees stored and paid in sUSD
    bytes32 private sUSD = "sUSD";

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory newAddresses = new bytes32[](2);
        newAddresses[0] = CONTRACT_FLEXIBLESTORAGE;
        newAddresses[1] = CONTRACT_ISSUER;
        addresses = newAddresses;
    }

    function flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    bool private reentrancyGuard = false;

    function getPartnerFeeRate(bytes32 volumePartnerCode) internal view returns (uint) {
        return flexibleStorage().getUIntValue(CONTRACT_PARTNERREGISTRY, feeRateSlot(volumePartnerCode));
    }

    function getPartnerDeposit(bytes32 volumePartnerCode) internal view returns (address) {
        flexibleStorage().getAddressValue(CONTRACT_PARTNERREGISTRY, depositSlot(volumePartnerCode));
    }

    function depositSlot(bytes32 volumePartnerCode) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(volumePartnerCode, "deposit"));
    }

    function feeRateSlot(bytes32 volumePartnerCode) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(volumePartnerCode, "feeRate"));
    }

    /**
     * Send funds to a partner, and invokes a 3rd party function to inform them of collected fees.

     * NOTE: this functionality has reentrancy risk because we are calling an untrusted external contract. To ensure
     * that the function cannot be called recursively, a guard is used. This is to ensure that we can continue to
     * treat synthetix as a reentrancy-safe system, as we have done in the past.
     */
    function payToPartner(bytes32 volumePartnerCode, address from, uint amount) internal noReentrancy returns (uint) {
        address deposit = getPartnerDeposit(volumePartnerCode);

        issuer().issueSynthsWithoutDebt(sUSD, deposit, amount);

        // use low-level call function here because if the partner's code fails, its not our problem.
        // we advise our partners to design their contracts such that their contracts continue to work even if `accrueFee` fails or is not called.
        deposit.call(abi.encodeWithSignature("accrueFee(bytes32,address,uint256)", volumePartnerCode, from, amount));

        emit PartnerPaid(volumePartnerCode, from, amount);
    }

    // though its not the most gas efficient, this effectively prevents reentrancy concerns
    modifier noReentrancy() {
        require(!reentrancyGuard, "No reentrancy");
        reentrancyGuard = true;
        _;
        reentrancyGuard = false;
    }

    event PartnerPaid(bytes32 indexed code, address indexed from, uint amount);
}
