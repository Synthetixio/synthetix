pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/isystemstatus
interface ISystemMessenger {
    // send a message only to one chain
    function post(
        uint targetChainId,
        bytes32 targetContract,
        bytes calldata data,
        uint32 gasLimit
    ) external;

    // send a copy of this message to all registered chains
    function broadcast(
        bytes32 targetContract,
        bytes calldata data,
        uint32 gasLimit
    ) external;
    
    // called by relayer to finalize message sent cross-chain
    function recv(
        uint srcChainId,
        uint srcNonce,
        bytes32 targetContract,
        bytes calldata data,
        uint32 gasLimit,
        bytes calldata sigs
    ) external;

    function addChain(uint chainId, address messenger) external;
    function removeChain(uint chainId) external;

    function authorizeSigner(address signer) external;
    function revokeSigner(address signer) external;

    function setRequiredSignatures(uint count) external;
}