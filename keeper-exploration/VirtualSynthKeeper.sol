
import "./IKeeper.sol";

contract VirtualSynthKeeper {
    function checkUpkeep(bytes calldata checkData) external returns (
      bool upkeepNeeded,
      bytes memory performData
    ) {
        upkeepNeeded = false;

        /**
         * for each synth currency key
         *     for each vsynth holder
         *         synth.readyToSettle()
         */
        

    }
}