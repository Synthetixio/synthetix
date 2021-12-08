pragma solidity ^0.5.16;

library SystemSettingsLib {
    function setCrossDomainMessageGasLimit(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 gasLimitSettings,
        uint crossDomainMessageGasLimit,
        uint minCrossDomainGasLimit,
        uint maxCrossDomainGasLimit
    ) public returns (bool success, bytes memory result) {
        require(
            crossDomainMessageGasLimit >= minCrossDomainGasLimit && crossDomainMessageGasLimit <= maxCrossDomainGasLimit,
            "Out of range xDomain gasLimit"
        );
        (success, result) = setUIntValue(flexibleStorage, settingContractName, gasLimitSettings, crossDomainMessageGasLimit);
    }

    function setUIntValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint value
    ) public returns (bool success, bytes memory result) {
        (success, result) = flexibleStorage.delegatecall(
            abi.encodeWithSignature("setUIntValue(bytes32,bytes32,uint)", settingContractName, settingName, value)
        );
    }

    function setBoolValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bool value
    ) public returns (bool success, bytes memory result) {
        (success, result) = flexibleStorage.delegatecall(
            abi.encodeWithSignature("setBoolValue(bytes32,bytes32,uint)", settingContractName, settingName, value)
        );
    }
}
