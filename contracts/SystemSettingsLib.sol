pragma solidity ^0.5.16;

// Internal references
import "./interfaces/IFlexibleStorage.sol";

library SystemSettingsLib {
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

    function setUIntValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint value
    ) public {
        IFlexibleStorage(flexibleStorage).setUIntValue(settingContractName, settingName, value);
    }

    function setBoolValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bool value
    ) public {
        IFlexibleStorage(flexibleStorage).setBoolValue(settingContractName, settingName, value);
    }
}
