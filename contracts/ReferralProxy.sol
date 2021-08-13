pragma solidity ^0.5.16;

// Inheritance
import "./MixinResolver.sol";
import "./Owned.sol";

// Internal references
import "./interfaces/ISynthetix.sol";

// External dependencies.
import "openzeppelin-solidity-2.3.0/contracts/token/ERC721/ERC721.sol";

contract ReferralProxy is MixinResolver, Owned, ERC721 {
    // ========== ADDRESS RESOLVER CONFIGURATION ==========
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    uint public issuedReferrals;

    mapping(address => bool) public existingUsers;
    mapping(uint => address) public referralOrigin;

    // ========== CONSTRUCTOR ==========

    constructor(address owner, address _resolver) public Owned(owner) MixinResolver(_resolver) {}

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_SYNTHETIX;
    }

    function issueReferrals(address _to, uint _amount) external onlyOwner {
        uint issuedUpdated = issuedReferrals.add(_amount);
        for (uint i = issuedReferrals; i < issuedUpdated; i++) {
            _mint(_to, i);
            referralOrigin[i] = _to;
        }
        issuedReferrals = issuedUpdated;
        emit ReferralsIssued(_to, _amount);
    }

    function sendReferral(address _to, uint referralId) external {
        require(!existingUsers[_to], "User exists");
        //TODO: can the referral be re-transferable? What are the implications of sending it to myself?
        transferFrom(msg.sender, _to, referralId);
        emit ReferralSent(msg.sender, _to, referralId);
    }

    function exchangeWithReferral(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external {
        synthetix().exchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);
    }

    event ReferralsIssued(address _to, uint _amount);
    event ReferralSent(address _from, address _to, uint _referralId);
}
