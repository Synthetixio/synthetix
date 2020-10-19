pragma solidity ^0.5.16;

// Inheritance
import "./ERC20.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IVirtualSynth.sol";
import "./interfaces/IExchanger.sol";


contract VirtualSynth is ERC20, IVirtualSynth {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    ISynth public synth;
    IAddressResolver public resolver;

    bool public settled = false;

    constructor(
        ISynth _synth,
        IAddressResolver _resolver,
        address _recipient,
        uint _amount
    ) public ERC20() {
        synth = _synth;
        resolver = _resolver;

        // Note: we can do this as Exchanger will issue this amount to us
        _mint(_recipient, _amount);
    }

    // INTERNALS

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(resolver.requireAndGetAddress("Exchanger", "Exchanger contract not found"));
    }

    function secsLeft() internal view returns (uint) {
        return exchanger().maxSecsLeftInWaitingPeriod(address(this), synth.currencyKey());
    }

    function balanceUnderlying(address account) internal view returns (uint) {
        uint totalBalance = IERC20(address(synth)).balanceOf(address(this));

        uint vBalanceOfAccount = balanceOf(account);

        return vBalanceOfAccount.divideDecimalRound(totalSupply()).multiplyDecimalRound(totalBalance);

        // NOTE: does not account for settlement
    }

    function internalSettle() internal {
        if (settled) {
            return;
        }
        settled = true;

        exchanger().settle(address(this), synth.currencyKey());

        emit Settled(totalSupply(), IERC20(address(synth)).balanceOf(address(this)));
    }

    // VIEWS

    function name() external view returns (string memory) {
        return string(abi.encodePacked("Virtual Synth ", synth.currencyKey()));
    }

    function symbol() external view returns (string memory) {
        return string(abi.encodePacked("v", synth.currencyKey()));
    }

    function decimals() external view returns (uint8) {
        return 18;
    }

    // show the balance of the underlying synth that the given address has, given
    // their proportion of totalSupply and
    function balanceOfUnderlying(address account) external view returns (uint) {
        return balanceUnderlying(account);
    }

    function secsLeftInWaitingPeriod() external view returns (uint) {
        return secsLeft();
    }

    function readyToSettle() external view returns (bool) {
        return secsLeft() == 0;
    }

    // PUBLIC FUNCTIONS

    // Perform settlement of the underlying exchange if required,
    // then burn the accounts vSynths and transfer them their owed balanceOfUnderlying
    function settle(address account) external {
        internalSettle();

        IERC20(address(synth)).transfer(account, balanceUnderlying(account));

        _burn(account, balanceOf(account));
    }

    event Settled(uint totalSupply, uint amountAfterSettled);
}
