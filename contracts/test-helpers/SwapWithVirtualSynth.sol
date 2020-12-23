pragma solidity ^0.5.16;

// Inheritance
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20.sol";

// Libraries
import "../SafeDecimalMath.sol";

// Internal references
import "../interfaces/ISynthetix.sol";
import "../interfaces/IAddressResolver.sol";
import "../interfaces/IVirtualSynth.sol";
import "../interfaces/IExchanger.sol";


interface IERC20Detailed {
    // ERC20 Optional Views
    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    // Views
    function totalSupply() external view returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    // Mutative functions
    function transfer(address to, uint value) external returns (bool);

    function approve(address spender, uint value) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint value
    ) external returns (bool);

    // Events
    event Transfer(address indexed from, address indexed to, uint value);

    event Approval(address indexed owner, address indexed spender, uint value);
}


interface ICurvePool {
    function exchange(
        int128 i,
        int128 j,
        uint dx,
        uint min_dy
    ) external;
}


contract VirtualToken is ERC20 {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    IVirtualSynth public vSynth;
    ICurvePool public pool;
    IERC20Detailed public targetToken;

    constructor(
        IVirtualSynth _vSynth,
        ICurvePool _pool,
        IERC20Detailed _targetToken
    ) public ERC20() {
        vSynth = _vSynth;
        pool = _pool;
        targetToken = _targetToken;
    }

    function _synthBalance() internal view returns (uint) {
        return IERC20(address(vSynth.synth())).balanceOf(address(this));
    }

    function name() external view returns (string memory) {
        return string(abi.encodePacked("Virtual Token ", targetToken.name()));
    }

    function symbol() external view returns (string memory) {
        return string(abi.encodePacked("v", targetToken.symbol()));
    }

    function decimals() external view returns (uint8) {
        return IERC20Detailed(address(vSynth.synth())).decimals();
    }

    function convert(address account, uint amount) external {
        // transfer the vSynth from the creating contract to me
        IERC20(address(vSynth)).transferFrom(msg.sender, address(this), amount);

        // now mint the same supply to the user
        _mint(account, amount);

        emit Converted(address(vSynth), amount);
    }

    function internalSettle() internal {
        if (vSynth.settled()) {
            return;
        }

        require(vSynth.readyToSettle(), "Not yet ready to settle");

        IERC20 synth = IERC20(address(vSynth.synth()));

        // settle all vSynths for this vToken (now I have synths)
        vSynth.settle(address(this));

        uint balanceAfterSettlement = synth.balanceOf(address(this));

        emit Settled(totalSupply(), balanceAfterSettlement);

        // allow the pool to spend my synths
        synth.approve(address(pool), balanceAfterSettlement);

        // now exchange all my synths (sBTC) for WBTC
        pool.exchange(2, 1, balanceAfterSettlement, 0);
    }

    function settle(address account) external {
        internalSettle();

        uint remainingTokenBalance = targetToken.balanceOf(address(this));

        uint accountBalance = balanceOf(account);

        // now determine how much of the proceeds the user should receive
        uint amount = accountBalance.divideDecimalRound(totalSupply()).multiplyDecimalRound(remainingTokenBalance);

        // burn these vTokens
        _burn(account, accountBalance);

        // finally, send the targetToken to the originator
        targetToken.transfer(account, amount);
    }

    event Converted(address indexed virtualSynth, uint amount);
    event Settled(uint totalSupply, uint amountAfterSettled);
}


contract SwapWithVirtualSynth {
    ICurvePool public incomingPool = ICurvePool(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD); // Curve: sUSD v2 Swap
    ICurvePool public outgoingPool = ICurvePool(0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714); // Curve: sBTC Swap

    ISynthetix public synthetix = ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);

    IERC20Detailed public sUSD = IERC20Detailed(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    IERC20Detailed public USDC = IERC20Detailed(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20Detailed public WBTC = IERC20Detailed(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);

    function usdcToWBTC(uint amount) external {
        // get user's USDC into this contract
        USDC.transferFrom(msg.sender, address(this), amount);

        // ensure the pool can transferFrom our contract
        USDC.approve(address(incomingPool), amount);

        // now invoke curve USDC to sUSD
        incomingPool.exchange(1, 3, amount, 0);

        // now exchange my sUSD to sBTC
        (, IVirtualSynth vSynth) = synthetix.exchangeWithVirtual("sUSD", sUSD.balanceOf(address(this)), "sBTC", bytes32(0));

        // wrap this vSynth in a new token ERC20 contract
        VirtualToken vToken = new VirtualToken(vSynth, outgoingPool, WBTC);

        IERC20 vSynthAsERC20 = IERC20(address(vSynth));

        // get the balance of vSynths I now have
        uint vSynthBalance = vSynthAsERC20.balanceOf(address(this));

        // approve vToken to spend those vSynths
        vSynthAsERC20.approve(address(vToken), vSynthBalance);

        // now have the vToken transfer itself the vSynths and mint the entire vToken supply to the user
        vToken.convert(msg.sender, vSynthBalance);

        emit VirtualTokenCreated(address(vToken), vSynthBalance);
    }

    event VirtualTokenCreated(address indexed vToken, uint totalSupply);
}
