pragma solidity ^0.4.25;

import "../ExternStateToken.sol";


contract PublicEST is ExternStateToken {
    uint8 constant DECIMALS = 18;

    constructor(address _proxy, TokenState _tokenState, string _name, string _symbol, uint _totalSupply, address _owner)
        public
        ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, DECIMALS, _owner)
    {}

    function transfer(address to, uint value) external optionalProxy returns (bool) {
        return _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom(address from, address to, uint value) external optionalProxy returns (bool) {
        return _transferFrom_byProxy(messageSender, from, to, value);
    }
}
