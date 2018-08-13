/*
-----------------------------------------------------------------
FILE INFORMATION -----------------------------------------------------------------

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
(Havven.sol) by paying nomins. Users can also deposit their nomins
and allow other users to purchase them with ETH. The ETH is sent
to the user who offered their nomins for sale.

This smart contract contains a balance of each currency, and
allows the owner of the contract (the Havven Foundation) to
manage the available balance of havven at their discretion, while
users are allowed to deposit and withdraw their own nomin deposits
if they have not yet been taken up by another user.

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
     * @param _fundsWallet The recipient of ETH and Nomins that are sent to this contract while exchanging.
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
     * @param _fundsWallet The new address to forward ETH and Nomins to
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
     * @param _oracle The new oracle address
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
     * @param _nomin The new nomin contract target
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
     * @param _havven The new havven contract target
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
     * @param _time The new priceStalePeriod
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
     * @param newEthPrice The current price of ether in USD, specified to 18 decimal places.
     * @param newHavvenPrice The current price of havvens in USD, specified to 18 decimal places.
     * @param timeSent The timestamp from the oracle when the transaction was created. This ensures we don't consider stale prices as current in times of heavy network congestion.
     */
    function updatePrices(uint newEthPrice, uint newHavvenPrice, uint timeSent)
        external
        onlyOracle
    {
        /* Must be the most recently sent price, but not too far in the future.
         * (so we can't lock ourselves out of updating the oracle for longer than this) */
        require(lastPriceUpdateTime < timeSent && timeSent < now + ORACLE_FUTURE_LIMIT, 
            "Time sent must be bigger than the last update, and must be less than now + ORACLE_FUTURE_LIMIT");

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

        emit Exchange("ETH", msg.value, "nUSD", requestedToPurchase);

        return requestedToPurchase;
    }

    /**
     * @notice Exchange ETH to nUSD while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param guaranteedRate The exchange rate (ether price) which must be honored or the call will revert.
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

        emit Exchange("ETH", msg.value, "HAV", havvensToSend);

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

        emit Exchange("nUSD", nominAmount, "HAV", havvensToSend);

        return havvensToSend; 
    }

    /**
     * @notice Exchange nUSD for Havvens while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param nominAmount The amount of nomins the user wishes to exchange.
     * @param guaranteedRate A rate (havven price) the caller wishes to insist upon.
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
     * @notice Allows the owner to withdraw havvens from this contract if needed.
     * @param amount The amount of havvens to attempt to withdraw (in 18 decimal places).
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
     * @param amount The amount of nomins to attempt to withdraw (in 18 decimal places).
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
     * @param amount The amount of nomins (in 18 decimal places) you want to ask about
     */
    function havvensReceivedForNomins(uint amount)
        public 
        view
        returns (uint)
    {
        // How many nomins would we receive after the transfer fee?
        uint nominsReceived = nomin.amountReceived(amount);

        // And what would that be worth in havvens based on the current price?
        return safeDiv_dec(nominsReceived, usdToHavPrice);
    }

    /**
     * @notice Calculate how many havvens you will receive if you transfer
     *         an amount of ether.
     * @param amount The amount of ether (in wei) you want to ask about
     */
    function havvensReceivedForEther(uint amount)
        public 
        view
        returns (uint)
    {
        // How much is the ETH they sent us worth in nUSD (ignoring the transfer fee)?
        uint valueSentInNomins = safeMul_dec(amount, usdToEthPrice); 

        // Now, how many HAV will that USD amount buy?
        return havvensReceivedForNomins(valueSentInNomins);
    }

    /**
     * @notice Calculate how many nomins you will receive if you transfer
     *         an amount of ether.
     * @param amount The amount of ether (in wei) you want to ask about
     */
    function nominsReceivedForEther(uint amount)
        public 
        view
        returns (uint)
    {
        // How many nomins would that amount of ether be worth?
        uint nominsTransferred = safeMul_dec(amount, usdToEthPrice);

        // And how many of those would you receive after a transfer (deducting the transfer fee)
        return nomin.amountReceived(nominsTransferred);
    }
    
    /* ========== MODIFIERS ========== */

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Must be oracle to perform this action");
        _;
    }

    modifier pricesNotStale
    {
        require(!pricesAreStale(), "Prices must not be stale to perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event FundsWalletUpdated(address newFundsWallet);
    event OracleUpdated(address newOracle);
    event NominUpdated(Nomin newNominContract);
    event HavvenUpdated(Havven newHavvenContract);
    event PriceStalePeriodUpdated(uint priceStalePeriod);
    event PricesUpdated(uint newEthPrice, uint newHavvenPrice, uint timeSent);
    event Exchange(string fromCurrency, uint fromAmount, string toCurrency, uint toAmount);
}
