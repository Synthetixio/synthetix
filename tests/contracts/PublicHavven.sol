/* PublicHavven.sol: expose the internal functions in Havven
 * for testing purposes.
 */

pragma solidity ^0.4.23;


import "contracts/Havven.sol";
import "contracts/TokenState.sol";


// Public getters for all items in the Havven contract, used for debugging/testing
contract PublicHavven is Havven {
    // generate getters for constants
    uint constant public MIN_FEE_PERIOD = 1 days;
    uint constant public MAX_FEE_PERIOD = 26 weeks;

    constructor(address _proxy, TokenState _state, address _owner, address _oracle, uint _price)
        Havven(_proxy, _state, _owner, _oracle, _price)
        public
    {}

    function currentTime()
        public
        returns (uint)
    {
        return now;
    }
}
