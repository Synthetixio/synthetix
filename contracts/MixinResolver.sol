
pragma solidity 0.4.25;


import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {

    AddressResolver public resolver;

    constructor(address _owner, address _resolver)
        Owned(_owner)
        public
    {
        resolver = AddressResolver(_resolver);
    }

    function setResolver(AddressResolver _resolver) public onlyOwner {
        resolver = _resolver;
    }
}
