pragma solidity ^0.5.16;

import "../ExternStateToken.sol";


contract PublicEST is ExternStateToken {
    uint8 constant DECIMALS = 18;

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        string memory _name,
        string memory _symbol,
        uint _totalSupply,
        address _owner
    ) public ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, DECIMALS, _owner) {}

    function transfer(address to, uint value) external optionalProxy returns (bool) {
        return _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom(
        address from,
        address to,
        uint value
    ) external optionalProxy returns (bool) {
        return _transferFrom_byProxy(messageSender, from, to, value);
    }

    // Index all parameters to make them easier to find in raw logs (as this will be emitted via a proxy and not decoded)
    event Received(address indexed sender, uint256 indexed inputA, bytes32 indexed inputB);

    function somethingToBeProxied(uint256 inputA, bytes32 inputB) external {
        emit Received(messageSender, inputA, inputB);
    }
}
