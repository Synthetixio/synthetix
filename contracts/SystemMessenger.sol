pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ISystemMessenger.sol";

// https://docs.synthetix.io/contracts/source/contracts/systemstatus
contract SystemMessenger is Owned, ISystemMessenger {

    bytes32 public constant CONTRACT_NAME = "SystemMessenger";

    IAddressResolver public resolver;

    uint[] public activeChains;

    mapping(uint => address) public messengerAddresses;
    mapping(uint => uint) public outgoingNonces;
    mapping(uint => uint) public incomingNonces;

    mapping(address => bool) public signers;
    uint public requiredSignatures;

    constructor(address _owner, IAddressResolver _resolver) public Owned(_owner) {
        resolver = _resolver;
        requiredSignatures = 1;
    }

    /* ========== VIEWS ========== */
    function getMessageHash(
        uint srcChainId,
        uint srcNonce,
        bytes32 targetContract,
        bytes memory data,
        uint32 gasLimit
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                bytes32("Synthetixv2x"),
                srcChainId,
                srcNonce,
                targetContract, 
                data, 
                gasLimit
            )
        );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // send a message only to one chain
    function post(
        uint targetChainId,
        bytes32 targetContract,
        bytes memory data,
        uint32 gasLimit
    ) public onlyAuthorizedMessenger {
        emit MessagePosted(targetChainId, outgoingNonces[targetChainId]++, targetContract, data, gasLimit);
    }

    // sends a copy of this message to all chains synthetix is deployed to
    function broadcast(
        bytes32 targetContract,
        bytes memory data,
        uint32 gasLimit
    ) public onlyAuthorizedMessenger {
        for (uint i = 0;i < activeChains.length;i++) {
            post(activeChains[i], targetContract, data, gasLimit);
        }
    }

    function recv(
        uint srcChainId,
        uint srcNonce,
        bytes32 targetContract,
        bytes calldata data,
        uint32 gasLimit,
        bytes calldata sigs
    ) external {
        require(incomingNonces[srcChainId]++ == srcNonce, "can only submit next message nonce");

        bytes32 signHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                getMessageHash(srcChainId, srcNonce, targetContract, data, gasLimit)
            )
        );

        require(validateSignatures(signHash, sigs) >= requiredSignatures, "invalid signature blob");

        // not using `requireAndGetAddress` becuase the message ID would be blocked otherwise
        // when `target.call` is executed below, it will simply fail the internal call without blocking the incoming nonce increment
        address target = resolver.getAddress(targetContract);

        (bool success, bytes memory returned) = target.call(data);

        emit MessageProcessed(srcChainId, srcNonce, targetContract, data, gasLimit, success, returned);
    }

    function addChain(uint chainId, address messenger) external onlyOwnerOrSelf {
        messengerAddresses[chainId] = messenger;
        activeChains.push(chainId);
    }

    function removeChain(uint chainId) external onlyOwnerOrSelf {
        messengerAddresses[chainId] = address(0);
        incomingNonces[chainId] = 0;
        outgoingNonces[chainId] = 0;
        
        for (uint i = 0;i < activeChains.length;i++) {
            if (activeChains[i] == chainId) {
                activeChains[i] = activeChains[activeChains.length - 1];

                activeChains.pop();
                return;
            }
        }

        revert("could not find specified chain id");
    }

    function authorizeSigner(address signer) external onlyOwnerOrSelf {
        signers[signer] = true;
    }

    function revokeSigner(address signer) external onlyOwnerOrSelf {
        signers[signer] = false;
    }

    function setRequiredSignatures(uint count) external onlyOwnerOrSelf {
        requiredSignatures = count;
    }

    /* ========== INTERNAL FUNCTIONS ========= */

    function validateSignatures(bytes32 signHash, bytes memory signatures) internal view returns (uint) {
        if (signatures.length == 0) {
            return 0;
        }

        address lastSigner = address(0);

        uint signatureCount = signatures.length / 65;

        for (uint256 i = 0; i < signatureCount; i++) {
            address signer = recoverSigner(signHash, signatures, i);

            if (signer <= lastSigner) {
                return 0; // Signers must be different
            }

            lastSigner = signer;

            if (!signers[signer]) {
                return 0;
            }
        }

        return signatureCount;
    }

    /**
    * copied exactly from https://github.com/argentlabs/argent-contracts/blob/develop/contracts/modules/common/Utils.sol
    * @notice Helper method to recover the signer at a given position from a list of concatenated signatures.
    * @param _signedHash The signed hash
    * @param _signatures The concatenated signatures.
    * @param _index The index of the signature to recover.
    */
    function recoverSigner(bytes32 _signedHash, bytes memory _signatures, uint _index) internal pure returns (address) {
        uint8 v;
        bytes32 r;
        bytes32 s;
        // we jump 32 (0x20) as the first slot of bytes contains the length
        // we jump 65 (0x41) per signature
        // for v we load 32 bytes ending with v (the first 31 come from s) then apply a mask
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(_signatures, add(0x20,mul(0x41,_index))))
            s := mload(add(_signatures, add(0x40,mul(0x41,_index))))
            v := and(mload(add(_signatures, add(0x41,mul(0x41,_index)))), 0xff)
        }
        require(v == 27 || v == 28, "Utils: bad v value in signature");

        address recoveredAddress = ecrecover(_signedHash, v, r, s);
        require(recoveredAddress != address(0), "Utils: ecrecover returned 0");
        return recoveredAddress;
    }

    /* ========== MODIFIERS ======== */
    modifier onlyAuthorizedMessenger {
        require(msg.sender == resolver.getAddress("Issuer") || msg.sender == owner, "Only authorized senders can call");
        _;
    }

    modifier onlyOwnerOrSelf {
        require(msg.sender == address(this) || msg.sender == owner, "Only owner or self can call");
        _;
    }

    /* ========== EVENTS ========== */
    event MessagePosted(uint indexed targetChainId, uint indexed nonce, bytes32 indexed targetContract, bytes data, uint32 gasLimit);
    event MessageProcessed(uint indexed srcChainId, uint indexed nonce, bytes32 indexed targetContract, bytes data, uint32 gasLimit, bool success, bytes resultData);
}