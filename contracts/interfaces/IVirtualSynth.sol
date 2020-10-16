pragma solidity >=0.4.24;

import "./ISynth.sol";


interface IVirtualSynth {
    function synth() external view returns (ISynth);

    function settled() external view returns (bool);


}
