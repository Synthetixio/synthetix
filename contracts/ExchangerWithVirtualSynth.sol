pragma solidity ^0.5.16;

// Inheritance
import "./Exchanger.sol";

// Internal references
import "./interfaces/IVirtualSynth.sol";
import "./VirtualSynth.sol";


contract ExchangerWithVirtualSynth is Exchanger {
    constructor(address _owner, address _resolver) public Exchanger(_owner, _resolver) {}

    function _createVirtualSynth(
        ISynth synth,
        address recipient,
        uint amount
    ) internal returns (IVirtualSynth vSynth) {
        // Note: should actually pass ReadProxyAddressResolver here to future-proof this vSynth,
        // but we don't have it currently in the AddressResolver...
        // Solution
        vSynth = new VirtualSynth(synth, resolver, recipient, amount);
        emit VirtualSynthCreated(address(vSynth), address(synth), synth.currencyKey(), amount);
    }

    event VirtualSynthCreated(address vSynth, address synth, bytes32 currencyKey, uint amount);
}
