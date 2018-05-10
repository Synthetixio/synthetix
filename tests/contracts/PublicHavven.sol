/* PublicHavven.sol: expose the internal functions in Havven
 * for testing purposes.
 */

pragma solidity 0.4.23;


import "contracts/Havven.sol";
import "contracts/TokenState.sol";


// Public getters for all items in the Havven contract, used for debugging/testing
contract PublicHavven is Havven {
    // generate getters for constants
    uint constant public MIN_FEE_PERIOD_DURATION_SECONDS = 1 days;
    uint constant public MAX_FEE_PERIOD_DURATION_SECONDS = 26 weeks;

    constructor(address _proxy, TokenState initialState, address _owner, address _oracle)
        Havven(_proxy, initialState, _owner, _oracle)
        public
    {}

    function currentTime()
        public
        returns (uint)
    {
        return now;
    }
}
