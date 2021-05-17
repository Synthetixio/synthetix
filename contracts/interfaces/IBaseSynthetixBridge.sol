pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IBaseSynthetixBridge {
    function suspendInitiation() external;

    function resumeInitiation() external;
}
