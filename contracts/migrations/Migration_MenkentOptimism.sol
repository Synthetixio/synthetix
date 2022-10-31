pragma solidity ^0.5.16;

import "../AddressResolver.sol";
import "../BaseMigration.sol";
import "../ExchangeRates.sol";
import "../ExchangeState.sol";
import "../ProxyERC20.sol";
import "../RewardsDistribution.sol";
import "../SystemStatus.sol";
import "../TokenState.sol";

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
    function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_MenkentOptimism is BaseMigration {
    // https://kovan-explorer.optimism.io/address/0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;
    address public constant OWNER = 0x7509FeAEE952F7dA93f746CF7134CFDE8f249C94;

    // ----------------------------
    // EXISTING SYNTHETIX CONTRACTS
    // ----------------------------

    // https://kovan-explorer.optimism.io/address/0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6
    AddressResolver public constant addressresolver_i = AddressResolver(0xb08b62e1cdfd37eCCd69A9ACe67322CCF801b3A6);
    // https://kovan-explorer.optimism.io/address/0x0064A673267696049938AA47595dD0B3C2e705A1
    ProxyERC20 public constant proxysynthetix_i = ProxyERC20(0x0064A673267696049938AA47595dD0B3C2e705A1);
    // https://kovan-explorer.optimism.io/address/0xEf8a2c1BC94e630463293F71bF5414d13e80F62D
    ExchangeState public constant exchangestate_i = ExchangeState(0xEf8a2c1BC94e630463293F71bF5414d13e80F62D);
    // https://kovan-explorer.optimism.io/address/0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C
    TokenState public constant tokenstatesynthetix_i = TokenState(0x22C9624c784214D53d43BDB4Bf56B3D3Bf2e773C);
    // https://kovan-explorer.optimism.io/address/0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB
    RewardsDistribution public constant rewardsdistribution_i =
        RewardsDistribution(0x9147Cb9e5ef262bd0b1d362134C40948dC00C3EB);
    // https://kovan-explorer.optimism.io/address/0xC964D325096ba170bF34f7c267405467D9E48353
    ExchangeRates public constant exchangerates_i = ExchangeRates(0xC964D325096ba170bF34f7c267405467D9E48353);
    // https://kovan-explorer.optimism.io/address/0xE90F90DCe5010F615bEC29c5db2D9df798D48183
    SystemStatus public constant systemstatus_i = SystemStatus(0xE90F90DCe5010F615bEC29c5db2D9df798D48183);

    // ----------------------------------
    // NEW CONTRACTS DEPLOYED TO BE ADDED
    // ----------------------------------

    // https://kovan-explorer.optimism.io/address/0x4098C0fCDB3dc406D807b68498E0a567cfe3f9c3
    address public constant new_SystemSettings_contract = 0x4098C0fCDB3dc406D807b68498E0a567cfe3f9c3;
    // https://kovan-explorer.optimism.io/address/0xC964D325096ba170bF34f7c267405467D9E48353
    address public constant new_ExchangeRates_contract = 0xC964D325096ba170bF34f7c267405467D9E48353;
    // https://kovan-explorer.optimism.io/address/0xb205415386F4b1Da1A60Dd739BFf60761A99792f
    address public constant new_Synthetix_contract = 0xb205415386F4b1Da1A60Dd739BFf60761A99792f;
    // https://kovan-explorer.optimism.io/address/0xE8d1bd4DE9A0aB4aF9197c13E6029c4Ea4E14de3
    address public constant new_Exchanger_contract = 0xE8d1bd4DE9A0aB4aF9197c13E6029c4Ea4E14de3;

    constructor() public BaseMigration(OWNER) {}

    function contractsRequiringOwnership() public pure returns (address[] memory contracts) {
        contracts = new address[](7);
        contracts[0] = address(addressresolver_i);
        contracts[1] = address(proxysynthetix_i);
        contracts[2] = address(exchangestate_i);
        contracts[3] = address(tokenstatesynthetix_i);
        contracts[4] = address(rewardsdistribution_i);
        contracts[5] = address(exchangerates_i);
        contracts[6] = address(systemstatus_i);
    }

    function migrate() external onlyOwner {
        require(
            ISynthetixNamedContract(new_SystemSettings_contract).CONTRACT_NAME() == "SystemSettings",
            "Invalid contract supplied for SystemSettings"
        );
        require(
            ISynthetixNamedContract(new_ExchangeRates_contract).CONTRACT_NAME() == "ExchangeRates",
            "Invalid contract supplied for ExchangeRates"
        );
        require(
            ISynthetixNamedContract(new_Exchanger_contract).CONTRACT_NAME() == "Exchanger",
            "Invalid contract supplied for Exchanger"
        );

        // ACCEPT OWNERSHIP for all contracts that require ownership to make changes
        acceptAll();

        // MIGRATION
        // Import all new contracts into the address resolver;
        addressresolver_importAddresses_0();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 1;
        addressresolver_rebuildCaches_1();
        // Rebuild the resolver caches in all MixinResolver contracts - batch 2;
        addressresolver_rebuildCaches_2();
        // Ensure the SNX proxy has the correct Synthetix target set;
        proxysynthetix_i.setTarget(Proxyable(new_Synthetix_contract));
        // Ensure the Exchanger contract can write to its State;
        exchangestate_i.setAssociatedContract(new_Exchanger_contract);
        // Ensure the Synthetix contract can write to its TokenState contract;
        tokenstatesynthetix_i.setAssociatedContract(new_Synthetix_contract);
        // Ensure the RewardsDistribution has Synthetix set as its authority for distribution;
        rewardsdistribution_i.setAuthority(new_Synthetix_contract);
        // Ensure the ExchangeRates contract has the standalone feed for SNX;
        exchangerates_i.addAggregator("SNX", 0x38D2f492B4Ef886E71D111c592c9338374e1bd8d);
        // Ensure the ExchangeRates contract has the standalone feed for ETH;
        exchangerates_i.addAggregator("ETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the standalone feed for BTC;
        exchangerates_i.addAggregator("BTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the ExchangeRates contract has the standalone feed for LINK;
        exchangerates_i.addAggregator("LINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the ExchangeRates contract has the standalone feed for UNI;
        exchangerates_i.addAggregator("UNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the standalone feed for AAVE;
        exchangerates_i.addAggregator("AAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the standalone feed for SOL;
        exchangerates_i.addAggregator("SOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Ensure the ExchangeRates contract has the standalone feed for AVAX;
        exchangerates_i.addAggregator("AVAX", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the standalone feed for MATIC;
        exchangerates_i.addAggregator("MATIC", 0x62FD93Fc58D94eE253542ECD5C23467F65dCdB73);
        // Ensure the ExchangeRates contract has the standalone feed for WTI;
        exchangerates_i.addAggregator("WTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);
        // Ensure the ExchangeRates contract has the feed for sETH;
        exchangerates_i.addAggregator("sETH", 0x7f8847242a530E809E17bF2DA5D2f9d2c4A43261);
        // Ensure the ExchangeRates contract has the feed for sBTC;
        exchangerates_i.addAggregator("sBTC", 0xd9BdB42229F1aefe47Cdf028408272686445D3ff);
        // Ensure the ExchangeRates contract has the feed for sLINK;
        exchangerates_i.addAggregator("sLINK", 0x4e5A8fe9d533dec45C7CB57D548B049785BA9861);
        // Ensure the ExchangeRates contract has the feed for sUNI;
        exchangerates_i.addAggregator("sUNI", 0xbac904786e476632e75fC6214C797fA80cce9311);
        // Ensure the ExchangeRates contract has the feed for sAAVE;
        exchangerates_i.addAggregator("sAAVE", 0xc051eCEaFd546e0Eb915a97F4D0643BEd7F98a11);
        // Ensure the ExchangeRates contract has the feed for sSOL;
        exchangerates_i.addAggregator("sSOL", 0xF549af21578Cfe2385FFD3488B3039fd9e52f006);
        // Ensure the ExchangeRates contract has the feed for sAVAX;
        exchangerates_i.addAggregator("sAVAX", 0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
        // Ensure the ExchangeRates contract has the feed for sMATIC;
        exchangerates_i.addAggregator("sMATIC", 0x62FD93Fc58D94eE253542ECD5C23467F65dCdB73);
        // Ensure the ExchangeRates contract has the feed for sWTI;
        exchangerates_i.addAggregator("sWTI", 0x282C4BD8A0A9eb8EcfC61eB0A8eE7290D5060fBB);

        // NOMINATE OWNERSHIP back to owner for aforementioned contracts
        nominateAll();
    }

    function acceptAll() internal {
        address[] memory contracts = contractsRequiringOwnership();
        for (uint i = 0; i < contracts.length; i++) {
            Owned(contracts[i]).acceptOwnership();
        }
    }

    function nominateAll() internal {
        address[] memory contracts = contractsRequiringOwnership();
        for (uint i = 0; i < contracts.length; i++) {
            returnOwnership(contracts[i]);
        }
    }

    function addressresolver_importAddresses_0() internal {
        bytes32[] memory addressresolver_importAddresses_names_0_0 = new bytes32[](4);
        addressresolver_importAddresses_names_0_0[0] = bytes32("SystemSettings");
        addressresolver_importAddresses_names_0_0[1] = bytes32("ExchangeRates");
        addressresolver_importAddresses_names_0_0[2] = bytes32("Synthetix");
        addressresolver_importAddresses_names_0_0[3] = bytes32("Exchanger");
        address[] memory addressresolver_importAddresses_destinations_0_1 = new address[](4);
        addressresolver_importAddresses_destinations_0_1[0] = address(new_SystemSettings_contract);
        addressresolver_importAddresses_destinations_0_1[1] = address(new_ExchangeRates_contract);
        addressresolver_importAddresses_destinations_0_1[2] = address(new_Synthetix_contract);
        addressresolver_importAddresses_destinations_0_1[3] = address(new_Exchanger_contract);
        addressresolver_i.importAddresses(
            addressresolver_importAddresses_names_0_0,
            addressresolver_importAddresses_destinations_0_1
        );
    }

    function addressresolver_rebuildCaches_1() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_1_0 = new MixinResolver[](20);
        addressresolver_rebuildCaches_destinations_1_0[0] = MixinResolver(new_SystemSettings_contract);
        addressresolver_rebuildCaches_destinations_1_0[1] = MixinResolver(0x20540E5EB1faff0DB6B1Dc5f0427C27f3852e2Ab);
        addressresolver_rebuildCaches_destinations_1_0[2] = MixinResolver(0xCD203357dA8c641BA99765ba0583BE4Ccd8D2121);
        addressresolver_rebuildCaches_destinations_1_0[3] = MixinResolver(new_Exchanger_contract);
        addressresolver_rebuildCaches_destinations_1_0[4] = MixinResolver(0xe345a6eE3e7ED9ef3F394DB658ca69a2d7A614A8);
        addressresolver_rebuildCaches_destinations_1_0[5] = MixinResolver(0x2a764Dd011E0142629183ef9Fec89dd5064Ec52A);
        addressresolver_rebuildCaches_destinations_1_0[6] = MixinResolver(0x5c9AD159E8fC9DC2dD081872dA56961e0B43d6AD);
        addressresolver_rebuildCaches_destinations_1_0[7] = MixinResolver(0xd98Ca2C4EFeFADC5Fe1e80ee4b872086E3Eac01C);
        addressresolver_rebuildCaches_destinations_1_0[8] = MixinResolver(0xc7960401a5Ca5A201d41Cf6532C7d2803f8D5Ce4);
        addressresolver_rebuildCaches_destinations_1_0[9] = MixinResolver(0xD170549da4115c39EC42D6101eAAE5604F26150d);
        addressresolver_rebuildCaches_destinations_1_0[10] = MixinResolver(0x5D3f869d8D54C6b987225feaC137851Eb93b2C06);
        addressresolver_rebuildCaches_destinations_1_0[11] = MixinResolver(new_ExchangeRates_contract);
        addressresolver_rebuildCaches_destinations_1_0[12] = MixinResolver(0xB613d148E47525478bD8A91eF7Cf2F7F63d81858);
        addressresolver_rebuildCaches_destinations_1_0[13] = MixinResolver(0xEC4075Ff2452907FCf86c8b7EA5B0B378e187373);
        addressresolver_rebuildCaches_destinations_1_0[14] = MixinResolver(0xED4f0C6DfE3235e9A93B808a60994C8697cC2236);
        addressresolver_rebuildCaches_destinations_1_0[15] = MixinResolver(new_Synthetix_contract);
        addressresolver_rebuildCaches_destinations_1_0[16] = MixinResolver(0x6Bd33a593D27De9af7EBb5fCBc012BBe7541A456);
        addressresolver_rebuildCaches_destinations_1_0[17] = MixinResolver(0x360bc0503362130aBE0b3393aC078B03d73a9EcA);
        addressresolver_rebuildCaches_destinations_1_0[18] = MixinResolver(0x9745E33Fa3151065568385f915C48d9E538B42a2);
        addressresolver_rebuildCaches_destinations_1_0[19] = MixinResolver(0x32FebC59E02FA5DaFb0A5e6D603a0693c53A0F34);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_1_0);
    }

    function addressresolver_rebuildCaches_2() internal {
        MixinResolver[] memory addressresolver_rebuildCaches_destinations_2_0 = new MixinResolver[](15);
        addressresolver_rebuildCaches_destinations_2_0[0] = MixinResolver(0x5e719d22C6ad679B28FE17E9cf56d3ad613a6723);
        addressresolver_rebuildCaches_destinations_2_0[1] = MixinResolver(0x99Fd0EbBE8144591F75A12E3E0edcF6d51DfF877);
        addressresolver_rebuildCaches_destinations_2_0[2] = MixinResolver(0xcDcD73dE9cc2B0A7285B75765Ef7b957963E57aa);
        addressresolver_rebuildCaches_destinations_2_0[3] = MixinResolver(0xBA097Fa1ABF647995154c8e9D77CEd04123b593f);
        addressresolver_rebuildCaches_destinations_2_0[4] = MixinResolver(0xdA730bF21BA6360af34cF065B042978017f2bf49);
        addressresolver_rebuildCaches_destinations_2_0[5] = MixinResolver(0xDbcfd6F265528d08FB7faA0934e18cf49A03AD65);
        addressresolver_rebuildCaches_destinations_2_0[6] = MixinResolver(0x8e08BF90B979698AdB6d722E9e27263f36366414);
        addressresolver_rebuildCaches_destinations_2_0[7] = MixinResolver(0xA3e4c049dA5Fe1c5e046fb3dCe270297D9b2c6a9);
        addressresolver_rebuildCaches_destinations_2_0[8] = MixinResolver(0x6bF98Cf7eC95EB0fB90d277515e040D32B104e1C);
        addressresolver_rebuildCaches_destinations_2_0[9] = MixinResolver(0x698E403AaC625345C6E5fC2D0042274350bEDf78);
        addressresolver_rebuildCaches_destinations_2_0[10] = MixinResolver(0x1e28378F64bC04E872a9D01Eb261926717346F98);
        addressresolver_rebuildCaches_destinations_2_0[11] = MixinResolver(0x1991bEA1eB08a78701F3330934B2301Fc6520AbA);
        addressresolver_rebuildCaches_destinations_2_0[12] = MixinResolver(0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee);
        addressresolver_rebuildCaches_destinations_2_0[13] = MixinResolver(0x8e0df45f66E620F85dF1D0490Cd2b19E57a4232A);
        addressresolver_rebuildCaches_destinations_2_0[14] = MixinResolver(0x929d8EC9A885cdCfdF28EA31B4A356532757DE5E);
        addressresolver_i.rebuildCaches(addressresolver_rebuildCaches_destinations_2_0);
    }
}
