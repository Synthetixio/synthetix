pragma solidity ^0.5.16;

// Inheritance
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IVirtualSynth.sol";
import "./interfaces/IExchanger.sol";
// Note: use OZ's IERC20 here as using ours will complain about conflicting names
// during the build
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/IERC20.sol";


contract VirtualSynth is ERC20, IVirtualSynth {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    ISynth public synth;
    IAddressResolver public resolver;

    bool public settled = false;

    uint8 public constant DECIMALS = 18;

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
        uint synthBalance = IERC20(address(synth)).balanceOf(address(this));

        uint vBalanceOfAccount = balanceOf(account);

        uint _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            return 0;
        }

        // NOTE: does not account for any pending settlement
        return vBalanceOfAccount.divideDecimalRound(_totalSupply).multiplyDecimalRound(synthBalance);
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

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    // get the rate of the vSynth to the synth.
    // Note: once all supply has been settled, this will return 0
    function rate() external view returns (uint) {
        uint _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            return 0;
        }

        uint synthBalance = IERC20(address(synth)).balanceOf(address(this));

        (uint reclaim, uint rebate, ) = exchanger().settlementOwing(address(this), synth.currencyKey());

        if (reclaim > 0) {
            synthBalance = synthBalance.sub(reclaim);
        } else if (rebate > 0) {
            synthBalance = synthBalance.add(rebate);
        }

        return synthBalance.divideDecimalRound(_totalSupply);
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
