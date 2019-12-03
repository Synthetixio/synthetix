pragma solidity ^0.4.23;

import "contracts/ExternStateToken.sol";

contract PublicEST is ExternStateToken {
    uint constant DECIMALS = 18;

    constructor(address _proxy, TokenState _tokenState,
                string _name, string _symbol, uint _totalSupply,
                address _owner)
        ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, DECIMALS, _owner)
        public
    {}

    function transfer(address to, uint value)
        optionalProxy
        external
        returns (bool)
    {
        bytes memory empty;
        return _transfer_byProxy(messageSender, to, value, empty);
    }

    function transfer(address to, uint value, bytes data)
        optionalProxy
        external
        returns (bool)
    {
        return _transfer_byProxy(messageSender, to, value, data);
    }

    function transferFrom(address from, address to, uint value)
        optionalProxy
        external
        returns (bool)
    {
        bytes memory empty;
        return _transferFrom_byProxy(messageSender, from, to, value, empty);
    }

    function transferFrom(address from, address to, uint value, bytes data)
        optionalProxy
        external
        returns (bool)
    {
        return _transferFrom_byProxy(messageSender, from, to, value, data);
    }
}
