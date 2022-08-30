pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegrationManager {
    struct StoredParameterIntegrationSettings {
        // A list of parameters that can be configured for direct integrations.
        // https://sips.synthetix.io/sips/sip-267/#parameters-involved
        MappedParameter[] atomicEquivalentForDexPricing; // value is encoded as a uint but can be converted into an address using address(uint160())
        MappedParameter[] atomicExchangeFeeRate;
        uint atomicTwapWindow;
        uint atomicMaxTwapDelta;
        uint atomicMaxVolumePerBlock;
        MappedParameter[] atomicVolatilityConsiderationWindow;
        MappedParameter[] atomicVolatilityTwapSeconds;
        MappedParameter[] atomicVolatilityUpdateThreshold;
        MappedParameter[] exchangeFeeRate;
        uint exchangeMaxDynamicFee;
        uint exchangeDynamicFeeRounds;
        uint exchangeDynamicFeeThreshold;
        uint exchangeDynamicFeeWeightDecay;
        // TODO: Add other parameters that affect execution timing (circuit breakers) and price,
        // since they should also be configurable via the DirectIntegration contract
    }

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

    function setExchangeParameters(address integration, StoredParameterIntegrationSettings calldata params) external;
}
