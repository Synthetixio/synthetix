pragma solidity ^0.8.9;

import "../VirtualSynth.sol";

contract TestableVirtualSynth is VirtualSynth {
    constructor() ERC20("", "") {}
}
