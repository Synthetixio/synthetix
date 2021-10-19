pragma solidity ^0.8.8;

import "./VirtualSynth.sol";

// https://docs.synthetix.io/contracts/source/contracts/virtualsynthmastercopy
// Note: this is the "frozen" mastercopy of the VirtualSynth contract that should be linked to from
//       proxies.
contract VirtualSynthMastercopy is VirtualSynth {
    constructor() public ERC20() {
        // Freeze mastercopy on deployment so it can never be initialized with real arguments
        initialized = true;
    }
}
