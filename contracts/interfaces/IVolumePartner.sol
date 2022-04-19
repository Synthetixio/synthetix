pragma solidity ^0.5.16;

interface IVolumePartner {
    function getFeeRate(bytes32 volumePartnerCode) external returns (uint);

    function registerVolumePartnerCode(
        bytes32 volumePartnerCode,
        address volumePartnerCodeOwner,
        uint feeRate
    ) external;

    function accrueFee(bytes32 volumePartnerCode, uint amount) external;

    function claimFees(bytes32 volumePartnerCode, address recipientAddress) external;

    function updateFeeRate(bytes32 volumePartnerCode, uint feeRate) external;

    function nominateOwner(bytes32 volumePartnerCode, address nominee) external;

    function acceptOwnership(bytes32 volumePartnerCode) external;
}
