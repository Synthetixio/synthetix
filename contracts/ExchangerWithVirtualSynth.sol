pragma solidity ^0.5.16;

// Inheritance
import "./Exchanger.sol";

// Internal references
import "./interfaces/IVirtualSynth.sol";
import "./MinimalProxyFactory.sol";
import "./VirtualSynth.sol";


// https://docs.synthetix.io/contracts/source/contracts/exchangerwithvirtualsynth
contract ExchangerWithVirtualSynth is MinimalProxyFactory, Exchanger {
    address public baseVirtualSynth;

    constructor(
        address _owner,
        address _resolver,
        address _baseVirtualSynth
    ) public MinimalProxyFactory() Exchanger(_owner, _resolver) {
        baseVirtualSynth = _baseVirtualSynth;
    }

    function _createVirtualSynth(
        IERC20 synth,
        address recipient,
        uint amount,
        bytes32 currencyKey
    ) internal returns (IVirtualSynth) {
        // prevent inverse synths from being allowed due to purgeability
        require(currencyKey[0] != 0x69, "Cannot virtualize this synth");

        VirtualSynth vSynth = VirtualSynth(_cloneAsMinimalProxy(baseVirtualSynth, "Could not create new vSynth"));
        vSynth.initialize(synth, resolver, recipient, amount, currencyKey);
        emit VirtualSynthCreated(address(synth), recipient, address(vSynth), currencyKey, amount);

        return IVirtualSynth(address(vSynth));
    }

    event VirtualSynthCreated(
        address indexed synth,
        address indexed recipient,
        address vSynth,
        bytes32 currencyKey,
        uint amount
    );
}
