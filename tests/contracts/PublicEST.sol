pragma solidity ^0.4.23;

import "contracts/ExternStateToken.sol";

contract PublicEST is ExternStateToken {
    constructor(address _proxy, TokenState _tokenState,
                string _name, string _symbol, uint _totalSupply,
                address _owner)
        ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, _owner)
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
