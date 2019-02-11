/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       DepotState.sol
version:    1.0
author:     Jackson Chan
date:       2019-02-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract that holds depot deposits state and queue state for 
the depot contract.

This contract is used side by side with the depot contract
to make it easier to upgrade the contract logic while maintaining
deposits and queues state.

The depot state contract would deploy and use an eternal storage 
pattern for data type storage. It will be the first contract to 
deploy an eternal storage for storage that can be extended to
other contracts.


When a new contract is deployed, it links to the existing
state contract, whose owner would then change its associated
contract to the new one.

-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "./EternalStorage.sol";
import "./State.sol";
import "./SafeDecimalMath.sol";

contract DepotState is EternalStorage {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* Stores deposits from users. */
    struct synthDeposit {
        // The user that made the deposit
        address user;
        // The amount (in Synths) that they deposited
        uint amount;
    }

    // FIELDS
    address depositStructContract;

    /* User deposits are sold on a FIFO (First in First out) basis. When users deposit
       synths with us, they get added this queue, which then gets fulfilled in order.
       Conceptually this fits well in an array, but then when users fill an order we
       end up copying the whole array around, so better to use an index mapping instead
       for gas performance reasons.

       The indexes are specified (inclusive, exclusive), so (0, 0) means there's nothing
       in the array, and (3, 6) means there are 3 elements at 3, 4, and 5. You can obtain
       the length of the "array" by querying depositEndIndex - depositStartIndex. All index
       operations use safeAdd, so there is no way to overflow, so that means there is a
       very large but finite amount of deposits this contract can handle before it fills up. */
    mapping(uint => synthDeposit) public deposits;

    // Storage keys
    bytes32 constant MIN_DEPOSIT_AMOUNT = "min_deposit_amount";

    // The starting index of our queue inclusive  
    bytes32 constant DEPOSIT_START_INDEX = "deposit_start_index";
    // The ending index of our queue exclusive  
    bytes32 constant DEPOSIT_END_INDEX = "deposit_end_index";  

    /* This is a convenience variable so users and dApps can just query how much sUSD
       we have available for purchase without having to iterate the mapping with a
       O(n) amount of calls for something we'll probably want to display quite regularly. */
    bytes32 constant TOTAL_SELLABLE_DEPOSITS = "total_sellable_deposits";

    /* If a user deposits a synth amount < the minimumDepositAmount the contract will keep
       the total of small deposits which will not be sold on market and the sender
       must call withdrawMyDepositedSynths() to get them back. */
    bytes32 constant SMALL_DEPOSITS = "small_deposits";

    constructor(address _owner, address _associatedContract)
        EternalStorage(_owner, _associatedContract)
        public 
    {}

    /* ========== SETTERS ========== */

    /**
     * @dev Set a new depositStruct contract address
     */
    function setDepositStructContract(address _depositStructContract)
        external
        onlyAssociatedContract
    {
        depositStructContract = _depositStructContract;
        emit DepositStructContractUpdated(_depositStructContract);
    }

    /**
     * @notice Set min deposit amount for given synth
     * @dev Only the associated contract may call this.
     * @param currencyKey The new preferred currency
     */
    function setTotalSellableDeposits(uint _amount)
        external
        onlyAssociatedContract
    {
        this.setUIntValue(MIN_DEPOSIT_AMOUNT, _amount);
    }

    /**
     * @notice Set min deposit amount for given synth
     * @dev Only the associated contract may call this.
     * @param currencyKey The new preferred currency
     */
    function addDeposit(synthDeposit _synthDeposit)
        external
        onlyAssociatedContract
    {
        // to be implemented
    }

    /**
     * @notice Increment the deposit start index for FIFO Queue
     * @dev Only the associated contract may call this.
     */
    function incrementDepositStartIndex()
        external
        onlyAssociatedContract
    {
        uint depositStartIndex = this.getUIntValue(DEPOSIT_START_INDEX);
        this.setUIntValue(DEPOSIT_START_INDEX, depositStartIndex.add(1));
    }
    
    /**
     * @notice Increment the totalSellableDeposits
     * @dev Only the associated contract may call this.
     */
    function incrementTotalSellableDeposits()
        external
        onlyAssociatedContract
    {
        uint totalSellableDeposits = this.getUIntValue(TOTAL_SELLABLE_DEPOSITS);
        this.setUIntValue(TOTAL_SELLABLE_DEPOSITS, totalSellableDeposits.add(1));
    }

    /**
     * @notice set smallDeposits for address if less than minAmount
     * @dev Only the associated contract may call this.
     * @param address to record smallDeposits for 
     */
    function setSmallDeposits(address _address, uint _amount)
        external
        onlyAssociatedContract
    {
        this.setUIntValue(keccak256(abi.encodePacked(SMALL_DEPOSITS, _address)), _amount);
    }

    /* ========== GETTERS ========== */

    /**
     * @notice Get min deposit amount for given synth
     * @dev Only the associated contract may call this.
     * @param currencyKey The new preferred currency
     */
    function getMinimumDepositAmount()
        external
        view
        returns (uint)
    {
        return this.getUIntValue(MIN_DEPOSIT_AMOUNT);
    }

    /**
     * @notice Get deposit start index for FIFO Queue
     * @dev Only the associated contract may call this.
     */
    function getDepositStartIndex()
        external
        view
        returns (uint)
    {
        return this.getUIntValue(DEPOSIT_START_INDEX);
    }

    /**
     * @notice Get deposit end index for FIFO Queue
     */
    function getDepositEndIndex()
        external
        view
        returns (uint)
    {
        return this.getUIntValue(DEPOSIT_END_INDEX);
    }

    /**
     * @notice Get totalSellableDeposits
     * @dev Only the associated contract may call this.
     */
    function getTotalSellableDeposits()
        external
        view
        returns (uint)
    {
        return this.getUIntValue(TOTAL_SELLABLE_DEPOSITS);
    }

    /**
     * @notice Get small deposits for address
     * @dev Only the associated contract may call this.
     * @param address to check for smallDeposits 
     */
    function getSmallDeposits(address _address)
        external
        view
        returns (uint)
    {
        return this.getUIntValue(keccak256(abi.encodePacked(SMALL_DEPOSITS, _address)));
    }

    /* ========== EVENTS ========== */

    event DepositStructContractUpdated(address depositStructContract);
}