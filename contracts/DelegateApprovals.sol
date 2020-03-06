pragma solidity 0.4.25;

import "./State.sol";


// https://docs.synthetix.io/contracts/DelegateApprovals
contract DelegateApprovals is State {
    // Approvals - [authoriser][delegate]
    // Each authoriser can have multiple delegates
    mapping(address => mapping(address => bool)) public approval;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _associatedContract The contract whose approval state this composes.
     */
    constructor(address _owner, address _associatedContract) public State(_owner, _associatedContract) {}

    function setApproval(address authoriser, address delegate) external onlyAssociatedContract {
        approval[authoriser][delegate] = true;
        emit Approval(authoriser, delegate);
    }

    function withdrawApproval(address authoriser, address delegate) external onlyAssociatedContract {
        delete approval[authoriser][delegate];
        emit WithdrawApproval(authoriser, delegate);
    }

    /* ========== EVENTS ========== */

    event Approval(address indexed authoriser, address delegate);
    event WithdrawApproval(address indexed authoriser, address delegate);
}
