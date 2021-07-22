pragma solidity ^0.5.16;

import "../BaseMigration.sol";
import "../AddressResolver.sol";
import "../ExchangeRates.sol";
import "../Issuer.sol";
import "../SystemSettings.sol";
import "../PurgeableSynth.sol";
import "../SystemStatus.sol";

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
    // https://etherscan.io/address/0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E
    SystemStatus public constant systemstatus_i = SystemStatus(0x1c86B3CDF2a60Ae3a574f7f71d44E2C50BDdB87E);

    // https://etherscan.io/address/0x2acfe6265D358d982cB1c3B521199973CD443C71
    PurgeableSynth public constant scexsynth_i = PurgeableSynth(0x2acfe6265D358d982cB1c3B521199973CD443C71);

    // https://etherscan.io/address/0x6Dc6a64724399524184C2c44a526A2cff1BaA507
    PurgeableSynth public constant icexsynth_i = PurgeableSynth(0x6Dc6a64724399524184C2c44a526A2cff1BaA507);

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() external pure returns (address[] memory contracts) {
        contracts = new address[](6);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(exchangerates_i);
        contracts[2] = address(issuer_i);
        contracts[3] = address(systemsettings_i);
        contracts[4] = address(scexsynth_i);
        contracts[5] = address(icexsynth_i);
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

        (bool synthSuspended, ) = systemstatus_i.synthExchangeSuspension("sCEFI");
        // ensure sCEFI suspended for exchange (ensures that after added using the existing sCEX feed
        // it doesn't allow anyone to trade in before the feed is upgraded to the sCEFI pricing).
        require(synthSuspended, "sCEFI must be suspended for exchange");

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        addressresolver_i.acceptOwnership();
        exchangerates_i.acceptOwnership();
        issuer_i.acceptOwnership();
        systemsettings_i.acceptOwnership();
        scexsynth_i.acceptOwnership();
        icexsynth_i.acceptOwnership();

        // MIGRATION

        // Add sCEFI

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

        // Purge iCEX

        // TODO SynthiCEX must be replaced with the latest PurgeableSynth.sol
        //  run through replace-synth for iCEX

        // old ProxyiCEX holders: https://api.ethplorer.io/getTopTokenHolders/0xAE7F21C0dFe5481ca77d538b5609938a51850942?apiKey=freekey&limit=100
        address[] memory icex_purge_addresses = new address[](2);
        icex_purge_addresses[0] = 0x4ceC62Fd5Da331e2C4f36D36D556A7F8d732eF6b;
        icex_purge_addresses[1] = 0xcbfc78d7e26C2FF131867ed74FA65572dAd6FC90;

        icexsynth_i.purge(icex_purge_addresses);

        require(icexsynth_i.totalSupply() == 0, "iCEX total supply is non-zero");

        // Purge sCEX

        // TODO SynthsCEX must be replaced with the latest PurgeableSynth.sol
        //  run through replace-synth for iCEX

        // scex holders https://api.ethplorer.io/getTopTokenHolders/0xeABACD844A196D7Faf3CE596edeBF9900341B420?apiKey=freekey&limit=100
        // old scex holders https://api.ethplorer.io/getTopTokenHolders/0xb91B114a24a1c16834F1217cC3B9eE117b6c817A?apiKey=freekey&limit=100
        address[] memory scex_purge_addresses = new address[](50);
        scex_purge_addresses[0] = 0x03B08491Fd4cbEB80d24b823FF4C542D8ff67382;
        scex_purge_addresses[1] = 0x095E5D0fa083bF92f09E590c899Aa962Dd1Bb5c7;
        scex_purge_addresses[2] = 0x0a36260b5eD99e002166f10550AfB8F662C6C35D;
        scex_purge_addresses[3] = 0x0f4023208058ecfFCb22A7409Df11F6D6013FE8A;
        scex_purge_addresses[4] = 0x1082725E9d32EcceC4A12014AFd127F172D9CdEb;
        scex_purge_addresses[5] = 0x215B67D707cEd250c3803a19348E9C565E42d7A3;
        scex_purge_addresses[6] = 0x391603b1C3b03A0133AD82E91692790e58f73570;
        scex_purge_addresses[7] = 0x40A6e8867cF13B1546429399Bd281929828ED140;
        scex_purge_addresses[8] = 0x461783A831E6dB52D68Ba2f3194F6fd1E0087E04;
        scex_purge_addresses[9] = 0x4a654EC9C24567CCaD3A807f3f08d72e9956b143;
        scex_purge_addresses[10] = 0x4D37f28D2db99e8d35A6C725a5f1749A085850a3;
        scex_purge_addresses[11] = 0x53f535EAb711F58eB6e82d4d964F575757F21777;
        scex_purge_addresses[12] = 0x5999865518C9de250b820762130FF7A7119A4558;
        scex_purge_addresses[13] = 0x5c3032BC0B3B7885BE940613397191dEcA12BCE0;
        scex_purge_addresses[14] = 0x5d396a2106694308A40608Ef14A1C0892B6b7fAa;
        scex_purge_addresses[15] = 0x691Ce62a208B195acCF54C39a98F1112C90046d1;
        scex_purge_addresses[16] = 0x74415F5C83A77A3410fC3e21e5E1A4b111216C51;
        scex_purge_addresses[17] = 0x76e6e2E9Ca0ee9a2BB4148566791FD6F2fEeAc32;
        scex_purge_addresses[18] = 0x7fd8A3e656C90A0e3cd703e4bA46aa4C9d9e84fB;
        scex_purge_addresses[19] = 0x82B793c278F8f273f17974DEc2Eb61300C266110;
        scex_purge_addresses[20] = 0x83f03902E6CD5CFc5fB9a6F3aE48265237563d82;
        scex_purge_addresses[21] = 0x8D8B1A6D04ae59e505e0F5557D977Bb603365F3c;
        scex_purge_addresses[22] = 0x8eE3C2B58D209318791517EF6E63E34D7408f8Cb;
        scex_purge_addresses[23] = 0x9389E143DfF86096766Cd9fF82198857745A8d7b;
        scex_purge_addresses[24] = 0x93F0930d837fF1a57256C73D92AD4E95d1e52743;
        scex_purge_addresses[25] = 0x945d5bcda8dCd9Cd8b221fd23CF4b6C0E7e50bD5;
        scex_purge_addresses[26] = 0x949b198324E7B92442C2Ccf73Bac6E3eF3a3A0A3;
        scex_purge_addresses[27] = 0x961c18A23306fe44c4323Adcb3BC343B0D193670;
        scex_purge_addresses[28] = 0x9894D43c67E8567F4Ba46b494f9010F21D52Ef78;
        scex_purge_addresses[29] = 0x9B5ea8C719e29A5bd0959FaF79C9E5c8206d0499;
        scex_purge_addresses[30] = 0xA0C2d3Ad9c5100A6a5DAa03dC6bAB01F0d54c361;
        scex_purge_addresses[31] = 0xAC0367375eC176d30f38DbC50904209F4dc67CF4;
        scex_purge_addresses[32] = 0xAf9c4D107cdA4b4331f325625eE1f6891D8b0A33;
        scex_purge_addresses[33] = 0xba2ef5189B762bd4C9E7f0b50fBBaB65193935e8;
        scex_purge_addresses[34] = 0xbc39A124D833fDF62fA0C828fF5F8Fac816e65CB;
        scex_purge_addresses[35] = 0xbcdCD3f4576440840a66076A8ECFeFA8123c8CB2;
        scex_purge_addresses[36] = 0xbec670245EEB37d8E9895c767467bA67b7099D62;
        scex_purge_addresses[37] = 0xC4b0772b22EdB9B1a68a6f51Ef6Dcb3667f7ce16;
        scex_purge_addresses[38] = 0xc753665D36c3b47c0B0e43985e628b987c901DF1;
        scex_purge_addresses[39] = 0xcf09F49b3C273A30f5cD9117271010a824a6844F;
        scex_purge_addresses[40] = 0xD004567BbAF8C40661CfA6c190D7E21E0E6Efc07;
        scex_purge_addresses[41] = 0xd2B1fbdeD5AB32931F6Add08a701F3e1fE6127bC;
        scex_purge_addresses[42] = 0xd4091d4c26C1C62d217CCe0ea9b4bc58C909A6bb;
        scex_purge_addresses[43] = 0xD6F46475aE01a6e8cA0f45D4137f2404bA63ede1;
        scex_purge_addresses[44] = 0xD998171b51dedE5BB420228f8Ca6E349DaF0FD62;
        scex_purge_addresses[45] = 0xdE7670354fE2110fbF3A2ca269096647fc955924;
        scex_purge_addresses[46] = 0xe345849F3f9e352348c77903f9c6E68Fc0355E1b;
        scex_purge_addresses[47] = 0xE97BC5Cf1b76CAF047E139Cd7283F13e0446D4A0;
        scex_purge_addresses[48] = 0xe9a93302f4A5195F8d5c0fd7de853F39c07e5279;
        scex_purge_addresses[49] = 0xFf50219d17083f234a37f9f85d5f1D5A05b3169f;

        scexsynth_i.purge(scex_purge_addresses);

        require(scexsynth_i.totalSupply() == 0, "sCEX total supply is non-zero");

        // REMOVE sCEX and iCEX

        // now remove the synths
        bytes32[] memory synthsToRemove = new bytes32[](2);
        synthsToRemove[0] = "sCEX";
        synthsToRemove[1] = "iCEX";
        issuer_i.removeSynths(synthsToRemove);

        // remove the feeds (to save gas)
        exchangerates_i.removeAggregator("sCEX");
        exchangerates_i.removeAggregator("iCEX");

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        addressresolver_i.nominateNewOwner(owner);
        exchangerates_i.nominateNewOwner(owner);
        issuer_i.nominateNewOwner(owner);
        systemsettings_i.nominateNewOwner(owner);
        scexsynth_i.nominateNewOwner(owner);
        icexsynth_i.nominateNewOwner(owner);
    }
}
