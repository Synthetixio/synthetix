pragma solidity ^0.4.23;

import "contracts/DestructibleExternStateToken.sol";

contract PublicDEST is DestructibleExternStateToken {
    constructor(address _proxy, string _name, string _symbol, uint _totalSupply,
                                   TokenState _state, address _owner)
        DestructibleExternStateToken(_proxy, _name, _symbol, _totalSupply, _state, _owner)
        public
    {}

    function transfer(address to, uint value)
        optionalProxy
        external
    {
        _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom(address from, address to, uint value)
        optionalProxy
        external
    {
        _transferFrom_byProxy(messageSender, from, to, value);
    }
}
