pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/IDirectIntegration
interface IDirectIntegrationManager {
    struct ParameterOverrides {
        // A list of parameters that can be configured for direct integrations.
        // https://sips.synthetix.io/sips/sip-267/#parameters-involved
        address dexPriceAggregator;
        uint atomicExchangeFeeRate; // TODO: create list to handle multiple synths
        uint atomicMaxTwapDelta;
        uint atomicMaxVolumePerBlock;
        uint atomicVolatilityConsiderationWindow;
        uint atomicVolatilityTwapSeconds;
        uint atomicVolatilityUpdateThreshold;
        uint exchangeFeeRate; // TODO: create list to handle multiple synths
        uint exchangeMaxDynamicFee;
        uint exchangeDynamicFeeRounds;
        uint exchangeDynamicFeeThreshold;
        uint exchangeDynamicFeeWeightDecay;
        // TODO: Add other parameters that affect execution timing (circuit breakers) and price,
        // since they should also be configurable via the DirectIntegration contract
    }

    function getParameterOverrides(address integration) external view returns (ParameterOverrides memory overrides);

    function setParameterOverrides(address integration, ParameterOverrides calldata params) external;

    // TODO: Consider moving all related parameters from SystemSettings to the DirectIntegrationManager.
}
