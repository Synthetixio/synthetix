pragma solidity ^0.4.21;

import "contracts/ExternStateToken.sol";
import "contracts/TokenState.sol";

contract PublicExternStateToken is ExternStateToken {
    function PublicExternStateToken(string _name, string _symbol,
                                         uint initialSupply, address initialBeneficiary,
                                         TokenState _state, address _owner)
        ExternStateToken(_name, _symbol, initialSupply, initialBeneficiary, _state, _owner)
        public {}

    function transfer_byProxy(address to, uint value) 
        public
        optionalProxy
        returns (bool)
    {
        return _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom_byProxy(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    function _messageSender()
        public
        returns (address)
    {
        return messageSender;
    }

    function _optionalProxy_tester()
        public
        optionalProxy
        returns (address)
    {
        return messageSender;
    }
}
