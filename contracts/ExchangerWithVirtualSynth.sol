pragma solidity ^0.8.9;

// Inheritance
import "./Exchanger.sol";

// Internal references
import "./MinimalProxyFactory.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IERC20.sol";

interface IVirtualSynthInternal {
    function initialize(
        IERC20 _synth,
        IAddressResolver _resolver,
        address _recipient,
        uint _amount,
        bytes32 _currencyKey
    ) external;
}

// https://docs.synthetix.io/contracts/source/contracts/exchangerwithvirtualsynth
contract ExchangerWithVirtualSynth is MinimalProxyFactory, Exchanger {
    constructor(address _owner, address _resolver) MinimalProxyFactory() Exchanger(_owner, _resolver) {
        CONTRACT_NAME = "ExchangerWithVirtualSynth";
    }

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_VIRTUALSYNTH_MASTERCOPY = "VirtualSynthMastercopy";

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = Exchanger.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_VIRTUALSYNTH_MASTERCOPY;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _virtualSynthMastercopy() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_VIRTUALSYNTH_MASTERCOPY);
    }

    function _createVirtualSynth(
        IERC20 synth,
        address recipient,
        uint amount,
        bytes32 currencyKey
    ) internal override returns (IVirtualSynth) {
        // prevent inverse synths from being allowed due to purgeability
        require(currencyKey[0] != 0x69, "Cannot virtualize this synth");

        IVirtualSynthInternal vSynth =
            IVirtualSynthInternal(_cloneAsMinimalProxy(_virtualSynthMastercopy(), "Could not create new vSynth"));
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
