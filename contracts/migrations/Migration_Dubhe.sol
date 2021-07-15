pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeRates.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_Dubhe is BaseMigration {
    // https://etherscan.io/address/0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // https://etherscan.io/address/0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83
    AddressResolver public constant addressresolver_i = AddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);
    // https://etherscan.io/address/0xd69b189020EF614796578AfE4d10378c5e7e1138
    ExchangeRates public constant exchangerates_i = ExchangeRates(0xd69b189020EF614796578AfE4d10378c5e7e1138);
    // https://etherscan.io/address/0xB774711F0BC1306ce892ef8C02D0476dCccB46B7
    Issuer public constant issuer_i = Issuer(0xB774711F0BC1306ce892ef8C02D0476dCccB46B7);
    // https://etherscan.io/address/0xD3C8d372bFCd36c2B452639a7ED6ef7dbFDC56F8
    SystemSettings public constant systemsettings_i = SystemSettings(0xD3C8d372bFCd36c2B452639a7ED6ef7dbFDC56F8);

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() external pure returns (address[] memory contracts) {
        contracts = new address[](4);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangerates_i);
        contracts[2] = address(issuer_i);
        contracts[3] = address(systemsettings_i);
    }

    function migrate(address currentOwner) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        // NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
        // https://etherscan.io/address/0x7D962af3899d24402c6009166e73B5FcFD741525
        address new_TokenStatesCEFI_contract = 0x7D962af3899d24402c6009166e73B5FcFD741525;
        // https://etherscan.io/address/0x81fb767600827Dbc58B03B4E1642FfD8B603BE78
        address new_ProxysCEFI_contract = 0x81fb767600827Dbc58B03B4E1642FfD8B603BE78;
        // https://etherscan.io/address/0x30A0fb944191BecEA024d1f8C55d40667A68994C
        address new_SynthsCEFI_contract = 0x30A0fb944191BecEA024d1f8C55d40667A68994C;

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        addressresolver_i.acceptOwnership();
        exchangerates_i.acceptOwnership();
        issuer_i.acceptOwnership();
        systemsettings_i.acceptOwnership();

        // MIGRATION
        // Import all new contracts into the address resolver;
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](3);
        addressresolver_importAddresses_names_0_0[0] = bytes32("TokenStatesCEFI");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ProxysCEFI");
        addressresolver_importAddresses_names_0_0[2] = bytes32("SynthsCEFI");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](3);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_TokenStatesCEFI_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ProxysCEFI_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_SynthsCEFI_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
        // Ensure the ExchangeRates contract has the feed for sCEFI;
        exchangerates_i.addAggregator("sCEFI", 0x283D433435cFCAbf00263beEF6A362b7cc5ed9f2);
        // Add synths to the Issuer contract - batch 1;
        ISynth[] memory issuer_addSynths_synthsToAdd_2_0 = new ISynth[](1);
        issuer_addSynths_synthsToAdd_2_0[0] = ISynth(new_SynthsCEFI_contract);
        issuer_i.addSynths(issuer_addSynths_synthsToAdd_2_0);
        // Set the exchange rates for various synths;
        bytes32[] memory systemsettings_setExchangeFeeRateForSynths_synthKeys_3_0 = new bytes32[](1);
        systemsettings_setExchangeFeeRateForSynths_synthKeys_3_0[0] = bytes32("sCEFI");
        uint256[] memory systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_3_1 = new uint256[](1);
        systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_3_1[0] = uint256(10000000000000000);
        systemsettings_i.setExchangeFeeRateForSynths(
            systemsettings_setExchangeFeeRateForSynths_synthKeys_3_0,
            systemsettings_setExchangeFeeRateForSynths_exchangeFeeRates_3_1
        );

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        addressresolver_i.nominateNewOwner(owner);
        exchangerates_i.nominateNewOwner(owner);
        issuer_i.nominateNewOwner(owner);
        systemsettings_i.nominateNewOwner(owner);
    }
}
