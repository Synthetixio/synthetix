/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       IssuanceController.sol
version:    0.1
author:     Kevin Brown

date:       2018-05-20

checked:    
approved:   

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Issuance controler contract. The issuance controller provides
a way for users to acquire Nomins (Nomin.sol) by paying ETH
and a way for users to acquire Havens (Havven.sol) by paying
Nomins.

This smart contract contains a balance of each currency, and
allows the owner of the contract (the Havven Foundation) to
manage the available balances of both currencies at their 
discretion.

In future releases this functionality will gradually move away
from a centralised approach with the Havven foundation
controlling all of the currency to a decentralised exchange
approach where users can exchange these assets freely.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;

import "contracts/Nomin.sol";
import "contracts/Havven.sol";
import "contracts/SelfDestructible.sol";
import "contracts/Pausable.sol";
import "contracts/SafeDecimalMath.sol";

/**
 * @title Issuance Controller Contract.
 */
contract IssuanceController is Pausable, SelfDestructible, SafeDecimalMath {

    /* ========== STATE VARIABLES ========== */

    Nomin public nomin;
    Havven public havven;

    /* The address of the oracle which pushes the havven price to this contract */
    address public oracle;
    /* Do not allow the oracle to submit times any further forward into the future than
       this constant. */
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    /* How long will the contract assume the price of any asset is correct */
    uint public priceStalePeriod = 3 hours;

    /* The time the prices were last updated */
    uint public lastPriceUpdateTime;
    /* The USD price of havvens written in UNIT */
    uint public havvenPrice;
    /* The USD price of ETH written in UNIT */
    uint public ethPrice;
    
    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _state A pre-populated contract containing token balances.
     * If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.
     * @param _owner The owner of this contract.
     */
    constructor(address _owner, address _beneficiary, uint _delay, address _oracle, uint _ethPrice, uint _havvenPrice)
        SelfDestructible(_owner, _beneficiary, _delay)
        /* Owned is initialised in DestructibleExternStateToken */
        public
    {
        oracle = _oracle;
        ethPrice = _ethPrice;
        havvenPrice = _havvenPrice;
        lastPriceUpdateTime = now;
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the Oracle that pushes the havven price to this contract
     */
    function setOracle(address _oracle)
        external
        onlyOwner
    {
        oracle = _oracle;
        
        emit OracleUpdated(oracle);
    }

    /**
     * @notice Set the stale period on the updated price variables
     */
    function setPriceStalePeriod(uint _time)
        external
        onlyOwner 
    {
        priceStalePeriod = _time;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    /**
     * @notice Access point for the oracle to update the prices of havvens / eth.
     */
    function updatePrices(uint newEthPrice, uint newHavvenPrice, uint timeSent)
        external
        onlyOracle  /* Should be callable only by the oracle. */
    {
        /* Must be the most recently sent price, but not too far in the future.
         * (so we can't lock ourselves out of updating the oracle for longer than this) */
        require(lastPriceUpdateTime < timeSent && timeSent < now + ORACLE_FUTURE_LIMIT);

        ethPrice = newEthPrice;
        havvenPrice = newHavvenPrice;
        lastPriceUpdateTime = timeSent;

        emit PricesUpdated(ethPrice, havvenPrice, lastPriceUpdateTime);
    }

    /**
     * @notice Check if the prices haven't been updated for longer than the stale period.
     */
    function pricesAreStale()
        public
        view
        returns (bool)
    {
        return safeAdd(lastPriceUpdateTime, priceStalePeriod) < now;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyOracle
    {
        require(msg.sender == oracle);
        _;
    }

    modifier priceNotStale
    {
        require(!pricesAreStale());
        _;
    }

    /* ========== EVENTS ========== */

    event PricesUpdated(uint newEthPrice, uint newHavvenPrice, uint timeSent);
    event OracleUpdated(address newOracle);
}
