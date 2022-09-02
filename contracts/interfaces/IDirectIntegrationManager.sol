pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegrationManager {

    struct ParameterIntegrationSettings {
        bytes32 currencyKey;
        address atomicEquivalentForDexPricing;
        uint atomicExchangeFeeRate;
        uint atomicTwapWindow;
        uint atomicMaxTwapDelta;
        uint atomicMaxVolumePerBlock;
        uint atomicVolatilityConsiderationWindow;
        uint atomicVolatilityTwapSeconds;
        uint atomicVolatilityUpdateThreshold;
        uint exchangeFeeRate;
        uint exchangeMaxDynamicFee;
        uint exchangeDynamicFeeRounds;
        uint exchangeDynamicFeeThreshold;
        uint exchangeDynamicFeeWeightDecay;
    }

    struct MappedParameter {
        bytes32 key;
        uint value;
    }

    function getExchangeParameters(address integration, bytes32 key) external view returns (ParameterIntegrationSettings memory settings);

    function setExchangeParameters(address integration, bytes32[] calldata currencyKeys, ParameterIntegrationSettings calldata params) external;
}
