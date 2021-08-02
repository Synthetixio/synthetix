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

    function upgrade(
        address currentOwner,
        bytes32 synthContractLabel,
        Synth newSynth
    ) external onlyDeployer {
        require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

        Issuer issuer = Issuer(resolver.requireAndGetAddress("Issuer", "Missing Issuer address in resolver"));
        Synth synthToRemove =
            Synth(resolver.requireAndGetAddress(synthContractLabel, "Cannot find old synth by the given label"));
        TokenState tokenState = synthToRemove.tokenState();
        Proxy proxy = synthToRemove.proxy();

        bytes32 synthKey = newSynth.currencyKey();

        require(synthKey == synthToRemove.currencyKey(), "Synth key does not match deployed");
        require(newSynth.tokenState() == tokenState, "TokenState mismatch in new synth");
        require(newSynth.proxy() == proxy, "Proxy mismatch in new synth");

        Owned(address(issuer)).acceptOwnership();
        Owned(address(synthToRemove)).acceptOwnership();
        Owned(address(newSynth)).acceptOwnership();
        Owned(address(tokenState)).acceptOwnership();
        Owned(address(proxy)).acceptOwnership();
        Owned(address(resolver)).acceptOwnership();

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

        // update the synth in the AddressResolver
        bytes32[] memory namesToImport = new bytes32[](1);
        namesToImport[0] = synthContractLabel;
        address[] memory addressesToImport = new address[](1);
        addressesToImport[0] = address(newSynth);
        resolver.importAddresses(namesToImport, addressesToImport);

        // Return ownership
        Owned(address(issuer)).nominateNewOwner(currentOwner);
        Owned(address(synthToRemove)).nominateNewOwner(currentOwner);
        Owned(address(newSynth)).nominateNewOwner(currentOwner);
        Owned(address(tokenState)).nominateNewOwner(currentOwner);
        Owned(address(proxy)).nominateNewOwner(currentOwner);
        Owned(address(resolver)).nominateNewOwner(currentOwner);
    }
}
