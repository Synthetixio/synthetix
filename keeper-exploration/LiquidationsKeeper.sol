a
import "./IKeeper.sol";

contract LiquidationsKeeper {
    function checkUpkeep(bytes calldata checkData) external returns (
      bool upkeepNeeded,
      bytes memory performData
    ) {
        upkeepNeeded = false;

        /**
            try function flagAccountForLiquidation(address account)
            
            canLiquidate
                accountsCollateralisationRatio >= getLiquidationRatio()
            
            upkeepNeeded = canLiquidate
         */   
    }

    function encodeCheckData(address account) {
        return Liquidations.canLiquidate.encode(account);
    }

    function performUpkeep(bytes calldata performData) external {

    }
}