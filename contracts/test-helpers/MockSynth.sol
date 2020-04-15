pragma solidity ^0.4.25;

import "../ExternStateToken.sol";
import "../interfaces/ISystemStatus.sol";


// Mock synth that also adheres to system status

contract MockSynth is ExternStateToken {
    ISystemStatus private systemStatus;
    bytes32 public currencyKey;

    constructor(
        address _proxy,
        TokenState _tokenState,
        string _name,
        string _symbol,
        uint _totalSupply,
        address _owner,
        bytes32 _currencyKey
    ) public ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, 18, _owner) {
        currencyKey = _currencyKey;
    }

    // Allow SystemStatus to be passed in directly
    function setSystemStatus(ISystemStatus _status) external {
        systemStatus = _status;
    }

    function transfer(address to, uint value) external optionalProxy returns (bool) {
        systemStatus.requireSynthActive(currencyKey);

        return _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom(address from, address to, uint value) external optionalProxy returns (bool) {
        systemStatus.requireSynthActive(currencyKey);

        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    event Issued(address indexed account, uint value);

    event Burned(address indexed account, uint value);

    // Allow these functions which are typically restricted to internal contracts, be open to us for mocking
    function issue(address account, uint amount) external {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);
        emit Issued(account, amount);
    }

    function burn(address account, uint amount) external {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emit Burned(account, amount);
    }
}
