/* PublicMath.sol: expose the internal functions in Math library
 * for testing purposes.
 */
pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;
import "../Math.sol";

contract PublicMath {
    using Math for uint;

    function powerDecimal(uint x, uint y) public pure returns (uint) {
        return x.powDecimal(y);
    }
}
