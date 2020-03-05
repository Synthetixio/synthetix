/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       DelegateApprovals.sol
version:    1.0
author:     Jackson Chan
checked:    Clinton Ennis
date:       2019-05-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The approval state contract is designed to allow a wallet to
authorise another address to perform actions, on a contract,
on their behalf. This could be an automated service
that would help a wallet claim fees / rewards on their behalf.

The concept is similar to the ERC20 interface where a wallet can
approve an authorised party to spend on the authorising party's
behalf in the allowance interface.

-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "./EternalStorage.sol";
import "./MixinResolver.sol";


contract DelegateApprovals is MixinResolver {
    bytes32 public constant BURN_FOR_ADDRESS = "BurnForAddress";
    bytes32 public constant ISSUE_FOR_ADDRESS = "IssueForAddress";
    bytes32 public constant CLAIM_FOR_ADDRESS = "ClaimForAddress";
    bytes32 public constant EXCHANGE_FOR_ADDRESS = "ExchangeForAddress";
    bytes32 public constant APPROVE_ALL = "ApproveAll";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_DELEGATEAPPROVALETERNALSTORAGE = "DelegateApprovalEternalStorage";

    bytes32[24] private addressesToCache = [CONTRACT_DELEGATEAPPROVALETERNALSTORAGE];

    // Each authoriser can have multiple delegates
    mapping(address => mapping(address => bool)) public approval;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _resolver The resolver address.
     */
    constructor(address _owner, address _resolver) public MixinResolver(_owner, _resolver, addressesToCache) {}

    /* ========== VIEWS ========== */

    function delegateApprovalEternalStorage() internal view returns (EternalStorage) {
        return
            EternalStorage(
                requireAndGetAddress(
                    CONTRACT_DELEGATEAPPROVALETERNALSTORAGE,
                    "Missing DelegateApprovalEternalStorage address"
                )
            );
    }

    // hash of actionName + address of authoriser + address for the delegate
    function canBurnFor(address authoriser, address delegate) external view returns (bool) {
        return _checkApproval(BURN_FOR_ADDRESS, authoriser, delegate);
    }

    function canIssueFor(address authoriser, address delegate) external view returns (bool) {
        return _checkApproval(ISSUE_FOR_ADDRESS, authoriser, delegate);
    }

    function canClaimFor(address authoriser, address delegate) external view returns (bool) {
        return _checkApproval(CLAIM_FOR_ADDRESS, authoriser, delegate);
    }

    function canExchangeFor(address authoriser, address delegate) external view returns (bool) {
        return _checkApproval(EXCHANGE_FOR_ADDRESS, authoriser, delegate);
    }

    function _approvedAll(address authoriser, address delegate) internal view returns (bool) {
        return
            delegateApprovalEternalStorage().getBooleanValue(_getKey(APPROVE_ALL, authoriser, delegate));
    }

    // internal function to check approval based on action 
    // if approved for all actions then will return true 
    // before checking specific approvals 
    function _checkApproval(bytes32 action, address authoriser, address delegate) internal view returns (bool) {
        if (_approvedAll(authoriser, delegate)) return true;

        return delegateApprovalEternalStorage().getBooleanValue(_getKey(action, authoriser, delegate));
    }

    // util to get key based on actionName + address of authoriser + address for the delegate
    function _getKey(bytes32 _action, address _authoriser, address _delegate) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_action, _authoriser, _delegate));
    }

    /* ========== SETTERS ========== */
    function approveAllDelegatePowers(address delegate) external {
        require(delegate != address(0), "Can't delegate to address(0)");
        delegateApprovalEternalStorage().setBooleanValue(_getKey(APPROVE_ALL, msg.sender, delegate), true);
    }

    function removeAllDelegatePowers(address delegate) external {
        delegateApprovalEternalStorage().deleteBooleanValue(_getKey(APPROVE_ALL, msg.sender, delegate));
    }

    function approveBurnOnBehalf(address delegate) external {
        require(delegate != address(0), "Can't delegate to address(0)");
        delegateApprovalEternalStorage().setBooleanValue(_getKey(BURN_FOR_ADDRESS, msg.sender, delegate), true);
    }    
    
    function removeBurnOnBehalf(address delegate) external {
        delegateApprovalEternalStorage().deleteBooleanValue(_getKey(BURN_FOR_ADDRESS, msg.sender, delegate));
    }

    function approveIssueOnBehalf(address delegate) external {
        require(delegate != address(0), "Can't delegate to address(0)");
        delegateApprovalEternalStorage().setBooleanValue(_getKey(ISSUE_FOR_ADDRESS, msg.sender, delegate), true);
    }    
    
    function removeIssueOnBehalf(address delegate) external {
        delegateApprovalEternalStorage().deleteBooleanValue(_getKey(ISSUE_FOR_ADDRESS, msg.sender, delegate));
    }

    function approveClaimOnBehalf(address delegate) external {
        require(delegate != address(0), "Can't delegate to address(0)");
        delegateApprovalEternalStorage().setBooleanValue(_getKey(CLAIM_FOR_ADDRESS, msg.sender, delegate), true);
    }    
   
    function removeClaimOnBehalf(address delegate) external {
        delegateApprovalEternalStorage().deleteBooleanValue(_getKey(CLAIM_FOR_ADDRESS, msg.sender, delegate));
    }

    function approveExchangeOnBehalf(address delegate) external {
        require(delegate != address(0), "Can't delegate to address(0)");
        delegateApprovalEternalStorage().setBooleanValue(_getKey(EXCHANGE_FOR_ADDRESS, msg.sender, delegate), true);
    }

    function removeExchangeOnBehalf(address delegate) external {
        delegateApprovalEternalStorage().deleteBooleanValue(_getKey(EXCHANGE_FOR_ADDRESS, msg.sender, delegate));
    }

    /* ========== EVENTS ========== */
}
