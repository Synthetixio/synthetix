pragma solidity ^0.5.16;


interface ISynth {
    function burn(address account, uint amount) external;

    function issue(address account, uint amount) external;

    function transfer(address to, uint value) external returns (bool);

    function transferAndSettle(address to, uint value) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint value
    ) external returns (bool);

    function transferFromAndSettle(
        address from,
        address to,
        uint value
    ) external returns (bool);

    // IERC20
    // function totalSupply() external view returns (uint);

    // function balanceOf(address owner) external view returns (uint);

    // function allowance(address owner, address spender) external view returns (uint);

    // function approve(address spender, uint value) external returns (bool);

    // // ERC20 Optional
    // function name() external view returns (string memory);

    // function symbol() external view returns (string memory);

    // function decimals() external view returns (uint8);

    // event Transfer(address indexed from, address indexed to, uint value);

    // event Approval(address indexed owner, address indexed spender, uint value);
}
