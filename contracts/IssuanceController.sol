/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       IssuanceController.sol
version:    2.0
author:     Kevin Brown

date:       2018-07-18

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Issuance controller contract. The issuance controller provides
a way for users to acquire nomins (Nomin.sol) and havvens
(Havven.sol) by paying ETH and a way for users to acquire havvens
(Havven.sol) by paying nomins.

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
        emit PriceStalePeriodUpdated(priceStalePeriod);
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
        // The multiplication works here because usdToEthPrice is specified in
        // 18 decimal places, just like our currency base.
        uint requestedToPurchase = safeMul_dec(msg.value, usdToEthPrice);

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
     * @notice Exchange ETH to nUSD while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param guaranteedRate The exchange rate which must be honored or the call will revert.
     */
    function exchangeEtherForNominsAtRate(uint guaranteedRate)
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Nomins (nUSD) received
    {
        require(guaranteedRate == usdToEthPrice);

        return exchangeEtherForNomins();
    }


    /**
     * @notice Exchange ETH to HAV.
     */
    function exchangeEtherForHavvens()
        public 
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Havvens (HAV) received
    {
        // How many Havvens are they going to be receiving?
        uint havvensToSend = havvensReceivedForEther(msg.value);

        // Store the ETH in our funds wallet
        fundsWallet.transfer(msg.value);

        // And send them the Havvens.
        havven.transfer(msg.sender, havvensToSend);

        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin contract filtered to our
        // address.

        return havvensToSend;
    }

    /**
     * @notice Exchange ETH to HAV while insisting on a particular set of rates. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rates.
     * @param guaranteedEtherRate The ether exchange rate which must be honored or the call will revert.
     * @param guaranteedHavvenRate The havven exchange rate which must be honored or the call will revert.
     */
    function exchangeEtherForHavvensAtRate(uint guaranteedEtherRate, uint guaranteedHavvenRate)
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Havvens (HAV) received
    {
        require(guaranteedEtherRate == usdToEthPrice);
        require(guaranteedHavvenRate == usdToHavPrice);

        return exchangeEtherForHavvens();
    }


    /**
     * @notice Exchange nUSD for Havvens
     * @param nominAmount The amount of nomins the user wishes to exchange.
     */
    function exchangeNominsForHavvens(uint nominAmount)
        public 
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Havvens (HAV) received
    {
        // How many Havvens are they going to be receiving?
        uint havvensToSend = havvensReceivedForNomins(nominAmount);
        
        // Ok, transfer the Nomins to our address.
        nomin.transferFrom(msg.sender, this, nominAmount);

        // And send them the Havvens.
        havven.transfer(msg.sender, havvensToSend);

        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Nomin and/or Havven contracts
        // filtered to our address.

        return havvensToSend; 
    }

    /**
     * @notice Exchange nUSD for Havvens while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param nominAmount The amount of nomins the user wishes to exchange.
     */
    function exchangeNominsForHavvensAtRate(uint nominAmount, uint guaranteedRate)
        public 
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Havvens (HAV) received
    {
        require(guaranteedRate == usdToHavPrice);

        return exchangeNominsForHavvens(nominAmount);
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

    /**
     * @notice Calculate how many havvens you will receive if you transfer
     *         an amount of nomins.
     */
    function havvensReceivedForNomins(uint amount)
        public 
        view
        returns (uint)
    {
        uint nominsReceived = nomin.amountReceived(amount);
        return safeDiv_dec(nominsReceived, usdToHavPrice);
    }

    /**
     * @notice Calculate how many havvens you will receive if you transfer
     *         an amount of ether (in wei).
     */
    function havvensReceivedForEther(uint amount)
        public 
        view
        returns (uint)
    {
        // First off, how much is the ETH they sent us worth in nUSD (ignoring the transfer fee)?
        uint valueSentInNomins = safeMul_dec(amount, usdToEthPrice); 

        // Now, how many HAV will that USD amount buy?
        return havvensReceivedForNomins(valueSentInNomins);
    }

    /**
     * @notice Calculate how many nomins you will receive if you transfer
     *         an amount of ether.
     */
    function nominsReceivedForEther(uint amount)
        public 
        view
        returns (uint)
    {
        uint nominsTransferred = safeMul_dec(amount, usdToEthPrice);
        return nomin.amountReceived(nominsTransferred);
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
    event PriceStalePeriodUpdated(uint priceStalePeriod);
    event PricesUpdated(uint newEthPrice, uint newHavvenPrice, uint timeSent);
}
