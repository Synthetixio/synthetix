pragma solidity >=0.4.24;

import "./ISynth.sol";


interface IVirtualSynth {
    // Views

    function synth() external view returns (ISynth);

    function readyToSettle() external view returns (bool);

    function settled() external view returns (bool);

    // Mutative functions
    function settle(address account) external;
}
