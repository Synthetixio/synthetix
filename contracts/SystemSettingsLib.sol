pragma solidity ^0.5.16;

// Internal references
import "./interfaces/IFlexibleStorage.sol";

library SystemSettingsLib {
    event IssuanceRatioUpdated(uint newRatio);

    function setUIntValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint value
    ) internal {
        IFlexibleStorage(flexibleStorage).setUIntValue(settingContractName, settingName, value);
    }

    // function setBoolValue(
    //     address flexibleStorage,
    //     bytes32 settingContractName,
    //     bytes32 settingName,
    //     bool value
    // ) internal {
    //     IFlexibleStorage(flexibleStorage).setBoolValue(settingContractName, settingName, value);
    // }

    function setCrossDomainMessageGasLimit(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 gasLimitSettings,
        uint crossDomainMessageGasLimit,
        uint minCrossDomainGasLimit,
        uint maxCrossDomainGasLimit
    ) public {
        require(
            crossDomainMessageGasLimit >= minCrossDomainGasLimit && crossDomainMessageGasLimit <= maxCrossDomainGasLimit,
            "Out of range xDomain gasLimit"
        );
        setUIntValue(flexibleStorage, settingContractName, gasLimitSettings, crossDomainMessageGasLimit);
    }

    function setIssuanceRatio(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint issuanceRatio,
        uint maxInssuranceRatio
    ) public {
        require(issuanceRatio <= maxInssuranceRatio, "New issuance ratio cannot exceed MAX_ISSUANCE_RATIO");
        setUIntValue(flexibleStorage, settingContractName, settingName, issuanceRatio);
        emit IssuanceRatioUpdated(issuanceRatio);
    }
}
