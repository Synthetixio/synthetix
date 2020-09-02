pragma solidity ^0.5.16;

import "../GasTank.sol";
import "../FlexibleStorage.sol";

import "./StubFlexibleStorage.sol";

import "../interfaces/ISystemStatus.sol";
import "../interfaces/ISystemSettings.sol";
import "../interfaces/IDelegateApprovals.sol";
import "../interfaces/IExchangeRates.sol";


contract FakeGasTank is GasTank {
    StubFlexibleStorage internal fakeFlexibleStorage;

    constructor(address _owner, address _resolver) public GasTank(_owner, _resolver) {
        fakeFlexibleStorage = new StubFlexibleStorage();
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(msg.sender);
    }

    function _systemSettings() internal view returns (ISystemSettings) {
        return ISystemSettings(msg.sender);
    }

    function _delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(msg.sender);
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(msg.sender);
    }

    function flexibleStorage() internal view returns (IFlexibleStorage) {
        return fakeFlexibleStorage;
    }

    function appendToAddressCache(bytes32 name) internal {}
}
