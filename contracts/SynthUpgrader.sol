pragma solidity ^0.5.16;

import "./BaseMigration.sol";
import "./AddressResolver.sol";
import "./Issuer.sol";
import "./Synth.sol";
import "./TokenState.sol";
import "./Proxy.sol";

contract SynthUpgrade is BaseMigration {
    // address public constant OWNER = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;

    // IAddressResolver resolver = IAddressResolver(0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83);

    AddressResolver public resolver;

    constructor(address _owner, AddressResolver _resolver) public BaseMigration(_owner) {
        resolver = _resolver;
    }

    function upgrade(bytes32[] calldata synthContractLabels, address[] calldata newSynths) external onlyOwner {
        address currentOwner = resolver.owner();

        require(owner == currentOwner, "The owner of this contract does not match the resolver");

        Issuer issuer = Issuer(resolver.requireAndGetAddress("Issuer", "Missing Issuer address in resolver"));

        resolver.acceptOwnership();
        issuer.acceptOwnership();

        uint numNewSynths = newSynths.length;

        for (uint i = 0; i < numNewSynths; i++) {
            upgradeSynth(currentOwner, issuer, synthContractLabels[i], Synth(newSynths[i]));
        }

        // update the synths in the AddressResolver
        resolver.importAddresses(synthContractLabels, newSynths);

        // Return ownership
        Owned(address(issuer)).nominateNewOwner(currentOwner);
        Owned(address(resolver)).nominateNewOwner(currentOwner);
    }

    function upgradeSynth(
        address currentOwner,
        Issuer issuer,
        bytes32 synthContractLabel,
        Synth newSynth
    ) internal {
        Synth synthToRemove =
            Synth(resolver.requireAndGetAddress(synthContractLabel, "Cannot find old synth by the given label"));
        TokenState tokenState = synthToRemove.tokenState();
        Proxy proxy = synthToRemove.proxy();

        bytes32 synthKey = newSynth.currencyKey();

        require(synthKey == synthToRemove.currencyKey(), "Synth key does not match deployed");
        require(newSynth.tokenState() == tokenState, "TokenState mismatch in new synth");
        require(newSynth.proxy() == proxy, "Proxy mismatch in new synth");

        Owned(address(synthToRemove)).acceptOwnership();
        Owned(address(newSynth)).acceptOwnership();
        Owned(address(tokenState)).acceptOwnership();
        Owned(address(proxy)).acceptOwnership();

        // track the totalSupply
        uint totalSupply = synthToRemove.totalSupply();

        // set the totalSupply in the new synth to match
        newSynth.setTotalSupply(totalSupply);

        require(newSynth.totalSupply() == synthToRemove.totalSupply(), "totalSupply mismatch");

        // set totalSupply on the old synth to 0 to allow removal
        synthToRemove.setTotalSupply(0);

        // remove the synth from the system
        issuer.removeSynth(synthKey);

        // rebuild the new synth's resolver cache if needed
        if (!newSynth.isResolverCached()) {
            newSynth.rebuildCache();
        }

        // now add the new synth
        issuer.addSynth(newSynth);

        // update the tokenState
        tokenState.setAssociatedContract(address(newSynth));

        // update the proxy
        proxy.setTarget(Proxyable(address(newSynth)));

        // Return ownership
        Owned(address(synthToRemove)).nominateNewOwner(currentOwner);
        Owned(address(newSynth)).nominateNewOwner(currentOwner);
        Owned(address(tokenState)).nominateNewOwner(currentOwner);
        Owned(address(proxy)).nominateNewOwner(currentOwner);
    }
}
