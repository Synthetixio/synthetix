pragma solidity ^0.5.16;


interface ISynth {
    // Views
    function currencyKey() external view returns (bytes32);

    // Mutative functions
    function burn(address account, uint amount) external;

    function issue(address account, uint amount) external;

    function transferAndSettle(address to, uint value) external returns (bool);

    function transferFromAndSettle(
        address from,
        address to,
        uint value
    ) external returns (bool);
}
