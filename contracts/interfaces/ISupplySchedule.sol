pragma solidity >=0.4.24;


interface ISupplySchedule {
    // Views
    function mintableSupply() external view returns (uint);

    function isMintable() external view returns (bool);

    // Mutative functions
    function recordMintEvent(uint supplyMinted) external returns (bool);
}
