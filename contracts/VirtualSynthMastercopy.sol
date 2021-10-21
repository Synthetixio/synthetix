pragma solidity ^0.8.9;

import "./VirtualSynth.sol";

// https://docs.synthetix.io/contracts/source/contracts/virtualsynthmastercopy
// Note: this is the "frozen" mastercopy of the VirtualSynth contract that should be linked to from
//       proxies.
// context: https://sips.synthetix.io/sips/sip-127/
contract VirtualSynthMastercopy is VirtualSynth {
    constructor() ERC20("", "") {
        // Freeze mastercopy on deployment so it can never be initialized with real arguments
        initialized = true;
    }
}
