/* PublicMath.sol: expose the internal functions in Math library
 * for testing purposes.
 */
pragma solidity ^0.8.8;

import "../Math.sol";

contract PublicMath {
    using Math for uint;

    function powerDecimal(uint x, uint y) public pure returns (uint) {
        return x.powDecimal(y);
    }
}
