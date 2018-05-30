/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       IssuanceController.sol
version:    1.0
author:     Kevin Brown

date:       2018-05-20

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Issuance controller contract. The issuance controller provides
a way for users to acquire nomins (Nomin.sol) by paying ETH
and a way for users to acquire havvens (Havven.sol) by paying
nomins.

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

import "contracts/SelfDestructible.sol";
import "contracts/Pausable.sol";
import "contracts/SafeDecimalMath.sol";
import "contracts/Havven.sol";
import "contracts/Nomin.sol";

/**
 * @title Issuance Controller Contract.
 */
contract IssuanceController is SafeDecimalMath, SelfDestructible, Pausable {

    /* ========== STATE VARIABLES ========== */
    Havven public havven;
    Nomin public nomin;

    // Address where the ether raised is transfered to
    address public fundsWallet;

    /* The address of the oracle which pushes the USD price havvens and ether to this contract */
    address public oracle;
    /* Do not allow the oracle to submit times any further forward into the future than
       this constant. */
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    /* How long will the contract assume the price of any asset is correct */
    uint public priceStalePeriod = 3 hours;

    /* The time the prices were last updated */
    uint public lastPriceUpdateTime;
    /* The USD price of havvens denominated in UNIT */
    uint public usdToHavPrice;
    /* The USD price of ETH denominated in UNIT */
    uint public usdToEthPrice;
    
    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _owner The owner of this contract.
     * @param _havven The Havven contract we'll interact with for balances and sending.
     * @param _nomin The Nomin contract we'll interact with for balances and sending.
     * @param _oracle The address which is able to update price information.
     * @param _usdToEthPrice The current price of ETH in USD, expressed in UNIT.
     * @param _usdToHavPrice The current price of Havven in USD, expressed in UNIT.
     */
    constructor(
        // Ownable
        address _owner,

        // Funds Wallet
        address _fundsWallet,

        // Other contracts needed
        Havven _havven,
        Nomin _nomin,

        // Oracle values - Allows for price updates
        address _oracle,
        uint _usdToEthPrice,
        uint _usdToHavPrice
    )
        /* Owned is initialised in SelfDestructible */
        SelfDestructible(_owner)
        Pausable(_owner)
        public
    {
        fundsWallet = _fundsWallet;
        havven = _havven;
        nomin = _nomin;
        oracle = _oracle;
        usdToEthPrice = _usdToEthPrice;
        usdToHavPrice = _usdToHavPrice;
        lastPriceUpdateTime = now;
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the funds wallet where ETH raised is held
     */
    function setFundsWallet(address _fundsWallet)
        external
        onlyOwner
    {
        fundsWallet = _fundsWallet;

        emit FundsWalletUpdated(fundsWallet);
    }
    
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
     * @notice Set the Nomin contract that the issuance controller uses to issue Nomins.
     */
    function setNomin(Nomin _nomin)
        external
        onlyOwner
    {
        nomin = _nomin;
        emit NominUpdated(_nomin);
    }

    /**
     * @notice Set the Havven contract that the issuance controller uses to issue Havvens.
     */
    function setHavven(Havven _havven)
        external
        onlyOwner
    {
        havven = _havven;
        emit HavvenUpdated(_havven);
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
        onlyOracle
    {
        /* Must be the most recently sent price, but not too far in the future.
         * (so we can't lock ourselves out of updating the oracle for longer than this) */
        require(lastPriceUpdateTime < timeSent && timeSent < now + ORACLE_FUTURE_LIMIT);

        usdToEthPrice = newEthPrice;
        usdToHavPrice = newHavvenPrice;
        lastPriceUpdateTime = timeSent;

        emit PricesUpdated(usdToEthPrice, usdToHavPrice, lastPriceUpdateTime);
    }

    /**
     * @notice Fallback function (exchanges ETH to nUSD)
     */
    function ()
        external
        payable
    {
        exchangeEtherForNomins();
    } 

    
    /**
     * @notice Exchange ETH to nUSD.
     */
    function exchangeEtherForNomins()
        public 
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Nomins (nUSD) received
    {
        // How many Nomins are available for us to sell?
        uint availableNomins = nomin.balanceOf(this);

        // The multiplication works here because usdToEthPrice is specified in
        // 18 decimal places, just like our currency base.
        uint requestedToPurchase = safeMul_dec(msg.value, usdToEthPrice);

        // Ensure we are only sending ones we have allocated to us.
        // This check is technically not required because the Nomin
        // contract should enforce this as well.
        require(availableNomins >= requestedToPurchase);

        // Store the ETH in our funds wallet
        fundsWallet.transfer(msg.value);

        // Send the nomins.
        // Note: Fees are calculated by the Nomin contract, so when 
        //       we request a specific transfer here, the fee is
        //       automatically deducted and sent to the fee pool.
        nomin.transfer(msg.sender, requestedToPurchase);

        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin contract filtered to our
        // address.

        return requestedToPurchase;
    }

    /**
     * @notice Exchange nUSD for Havvens
     */
    function exchangeNominsForHavvens(uint amount)
        external
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Havvens (HAV) received
    {
        // Does the sender have enough nUSD to request this exchange?
        require(amount <= nomin.balanceOf(msg.sender));

        // How many Havvens are they going to be receiving?
        // Calculate the amount of Nomins we will receive after the transfer (minus fees)
        uint amountReceived = safeMul_dec(nomin.amountReceived(amount), usdToHavPrice);

        // Do we have enough Havvens to service the request?
        require(amountReceived <= havven.balanceOf(this));

        // Ok, transfer the Nomins to our address.
        nomin.approve(this, amount);
        nomin.transferFrom(msg.sender, this, amount);

        // // And send them the Havvens.
        // havven.transfer(msg.sender, amountReceived);

        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin and/or Havven contracts
        // filtered to our address.

        return amountReceived;
    }

    /**
     * @notice Withdraw havvens: Allows the owner to withdraw havvens from this contract if needed.
     */
    function withdrawHavvens(uint amount)
        external
        onlyOwner
    {
        havven.transfer(owner, amount);
        
        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin and/or Havven contracts
        // filtered to our address.
    }
    
    /**
     * @notice Withdraw nomins: Allows the owner to withdraw nomins from this contract if needed.
     */
    function withdrawNomins(uint amount)
        external
        onlyOwner
    {
        nomin.transfer(owner, amount);
        
        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin and/or Havven contracts
        // filtered to our address.
    }

    /* ========== VIEWS ========== */
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

    modifier pricesNotStale
    {
        require(!pricesAreStale());
        _;
    }

    /* ========== EVENTS ========== */

    event FundsWalletUpdated(address newFundsWallet);
    event OracleUpdated(address newOracle);
    event NominUpdated(Nomin newNominContract);
    event HavvenUpdated(Havven newHavvenContract);
    event PricesUpdated(uint newEthPrice, uint newHavvenPrice, uint timeSent);
}
