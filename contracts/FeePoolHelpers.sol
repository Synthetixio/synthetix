/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       FeePoolHelpers.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis
date:       2019-06-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

FeePool helper functions to view information about the penalty
threshold and other fee related calculations.

-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "./SafeDecimalMath.sol";
import "./ISynthetix.sol";

contract FeePool {
    uint public PENALTY_THRESHOLD;
}

contract FeePoolHelpers {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    FeePool public feePool;
    ISynthetix public synthetix;

    /**
     * @dev Constructor
     * @param _feePool The proxy address for the feePool.
     */
    constructor(FeePool _feePool, ISynthetix _synthetix)
        public
    {
        feePool = _feePool;
        synthetix = _synthetix;
    }

    /**
    * @notice Calculate the collateral ratio before penalty is applied.
    */
    function getPenaltyThresholdRatio()
        public
        view
        returns (uint)
    {
        uint targetRatio = synthetix.synthetixState().issuanceRatio();
        uint penaltyThreshold = feePool.PENALTY_THRESHOLD();

        return targetRatio.multiplyDecimal(SafeDecimalMath.unit().add(penaltyThreshold));
    }
}
