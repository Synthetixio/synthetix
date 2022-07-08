pragma solidity ^0.5.16;

interface IVolumePartnerDeposit {
    function accrueFee(bytes32 volumePartnerCode, address from, uint amount) external;
}

interface IPartnerRegistry {
    function getFeeRate(bytes32 volumePartnerCode) external view returns (uint);

    function registerVolumePartnerCode(
        bytes32 volumePartnerCode,
        address volumePartnerCodeOwner,
        uint feeRate
    ) external;

    function updateFeeRate(bytes32 volumePartnerCode, uint feeRate) external;

    function nominatePartnerOwner(bytes32 volumePartnerCode, address nominee) external;

    function acceptPartnerOwnership(bytes32 volumePartnerCode) external;
}
