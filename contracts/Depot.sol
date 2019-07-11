/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Depot.sol
version:    3.0
author:     Kevin Brown
date:       2018-10-23

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Depot contract. The Depot provides
a way for users to acquire synths (Synth.sol) and SNX
(Synthetix.sol) by paying ETH and a way for users to acquire SNX
(Synthetix.sol) by paying synths. Users can also deposit their synths
and allow other users to purchase them with ETH. The ETH is sent
to the user who offered their synths for sale.

This smart contract contains a balance of each token, and
allows the owner of the contract (the Synthetix Foundation) to
manage the available balance of synthetix at their discretion, while
users are allowed to deposit and withdraw their own synth deposits
if they have not yet been taken up by another user.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./SelfDestructible.sol";
import "./Pausable.sol";
import "./SafeDecimalMath.sol";
import "./ISynthetix.sol";
import "./ISynth.sol";
import "./IFeePool.sol";

/**
 * @title Depot Contract.
 */
contract Depot is SelfDestructible, Pausable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== STATE VARIABLES ========== */
    ISynthetix public synthetix;
    ISynth public synth;
    IFeePool public feePool;

    // Address where the ether and Synths raised for selling SNX is transfered to
    // Any ether raised for selling Synths gets sent back to whoever deposited the Synths,
    // and doesn't have anything to do with this address.
    address public fundsWallet;

    /* The address of the oracle which pushes the USD price SNX and ether to this contract */
    address public oracle;
    /* Do not allow the oracle to submit times any further forward into the future than
       this constant. */
    uint public constant ORACLE_FUTURE_LIMIT = 10 minutes;

    /* How long will the contract assume the price of any asset is correct */
    uint public priceStalePeriod = 3 hours;

    /* The time the prices were last updated */
    uint public lastPriceUpdateTime;
    /* The USD price of SNX denominated in UNIT */
    uint public usdToSnxPrice;
    /* The USD price of ETH denominated in UNIT */
    uint public usdToEthPrice;

    /* Stores deposits from users. */
    struct synthDeposit {
        // The user that made the deposit
        address user;
        // The amount (in Synths) that they deposited
        uint amount;
    }

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
    // The starting index of our queue inclusive
    uint public depositStartIndex;
    // The ending index of our queue exclusive
    uint public depositEndIndex;

    /* This is a convenience variable so users and dApps can just query how much sUSD
       we have available for purchase without having to iterate the mapping with a
       O(n) amount of calls for something we'll probably want to display quite regularly. */
    uint public totalSellableDeposits;

    // The minimum amount of sUSD required to enter the FiFo queue
    uint public minimumDepositAmount = 50 * SafeDecimalMath.unit();

    // If a user deposits a synth amount < the minimumDepositAmount the contract will keep
    // the total of small deposits which will not be sold on market and the sender
    // must call withdrawMyDepositedSynths() to get them back.
    mapping(address => uint) public smallDeposits;


    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _owner The owner of this contract.
     * @param _fundsWallet The recipient of ETH and Synths that are sent to this contract while exchanging.
     * @param _synthetix The Synthetix contract we'll interact with for balances and sending.
     * @param _synth The Synth contract we'll interact with for balances and sending.
     * @param _oracle The address which is able to update price information.
     * @param _usdToEthPrice The current price of ETH in USD, expressed in UNIT.
     * @param _usdToSnxPrice The current price of Synthetix in USD, expressed in UNIT.
     */
    constructor(
        // Ownable
        address _owner,

        // Funds Wallet
        address _fundsWallet,

        // Other contracts needed
        ISynthetix _synthetix,
        ISynth _synth,
		IFeePool _feePool,

        // Oracle values - Allows for price updates
        address _oracle,
        uint _usdToEthPrice,
        uint _usdToSnxPrice
    )
        /* Owned is initialised in SelfDestructible */
        SelfDestructible(_owner)
        Pausable(_owner)
        public
    {
        fundsWallet = _fundsWallet;
        synthetix = _synthetix;
        synth = _synth;
        feePool = _feePool;
        oracle = _oracle;
        usdToEthPrice = _usdToEthPrice;
        usdToSnxPrice = _usdToSnxPrice;
        lastPriceUpdateTime = now;
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the funds wallet where ETH raised is held
     * @param _fundsWallet The new address to forward ETH and Synths to
     */
    function setFundsWallet(address _fundsWallet)
        external
        onlyOwner
    {
        fundsWallet = _fundsWallet;
        emit FundsWalletUpdated(fundsWallet);
    }

    /**
     * @notice Set the Oracle that pushes the synthetix price to this contract
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
     * @notice Set the Synth contract that the issuance controller uses to issue Synths.
     * @param _synth The new synth contract target
     */
    function setSynth(ISynth _synth)
        external
        onlyOwner
    {
        synth = _synth;
        emit SynthUpdated(_synth);
    }

    /**
     * @notice Set the Synthetix contract that the issuance controller uses to issue SNX.
     * @param _synthetix The new synthetix contract target
     */
    function setSynthetix(ISynthetix _synthetix)
        external
        onlyOwner
    {
        synthetix = _synthetix;
        emit SynthetixUpdated(_synthetix);
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

    /**
     * @notice Set the minimum deposit amount required to depoist sUSD into the FIFO queue
     * @param _amount The new new minimum number of sUSD required to deposit
     */
    function setMinimumDepositAmount(uint _amount)
        external
        onlyOwner
    {
        // Do not allow us to set it less than 1 dollar opening up to fractional desposits in the queue again
        require(_amount > SafeDecimalMath.unit(), "Minimum deposit amount must be greater than UNIT");
        minimumDepositAmount = _amount;
        emit MinimumDepositAmountUpdated(minimumDepositAmount);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    /**
     * @notice Access point for the oracle to update the prices of SNX / eth.
     * @param newEthPrice The current price of ether in USD, specified to 18 decimal places.
     * @param newSynthetixPrice The current price of SNX in USD, specified to 18 decimal places.
     * @param timeSent The timestamp from the oracle when the transaction was created. This ensures we don't consider stale prices as current in times of heavy network congestion.
     */
    function updatePrices(uint newEthPrice, uint newSynthetixPrice, uint timeSent)
        external
        onlyOracle
    {
        /* Must be the most recently sent price, but not too far in the future.
         * (so we can't lock ourselves out of updating the oracle for longer than this) */
        require(lastPriceUpdateTime < timeSent, "Time must be later than last update");
        require(timeSent < (now + ORACLE_FUTURE_LIMIT), "Time must be less than now + ORACLE_FUTURE_LIMIT");

        usdToEthPrice = newEthPrice;
        usdToSnxPrice = newSynthetixPrice;
        lastPriceUpdateTime = timeSent;

        emit PricesUpdated(usdToEthPrice, usdToSnxPrice, lastPriceUpdateTime);
    }

    /**
     * @notice Fallback function (exchanges ETH to sUSD)
     */
    function ()
        external
        payable
    {
        exchangeEtherForSynths();
    }

    /**
     * @notice Exchange ETH to sUSD.
     */
    function exchangeEtherForSynths()
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Synths (sUSD) received
    {
        uint ethToSend;

        // The multiplication works here because usdToEthPrice is specified in
        // 18 decimal places, just like our currency base.
        uint requestedToPurchase = msg.value.multiplyDecimal(usdToEthPrice);
        uint remainingToFulfill = requestedToPurchase;

        // Iterate through our outstanding deposits and sell them one at a time.
        for (uint i = depositStartIndex; remainingToFulfill > 0 && i < depositEndIndex; i++) {
            synthDeposit memory deposit = deposits[i];

            // If it's an empty spot in the queue from a previous withdrawal, just skip over it and
            // update the queue. It's already been deleted.
            if (deposit.user == address(0)) {

                depositStartIndex = depositStartIndex.add(1);
            } else {
                // If the deposit can more than fill the order, we can do this
                // without touching the structure of our queue.
                if (deposit.amount > remainingToFulfill) {

                    // Ok, this deposit can fulfill the whole remainder. We don't need
                    // to change anything about our queue we can just fulfill it.
                    // Subtract the amount from our deposit and total.
                    uint newAmount = deposit.amount.sub(remainingToFulfill);
                    deposits[i] = synthDeposit({ user: deposit.user, amount: newAmount});

                    totalSellableDeposits = totalSellableDeposits.sub(remainingToFulfill);

                    // Transfer the ETH to the depositor. Send is used instead of transfer
                    // so a non payable contract won't block the FIFO queue on a failed
                    // ETH payable for synths transaction. The proceeds to be sent to the
                    // synthetix foundation funds wallet. This is to protect all depositors
                    // in the queue in this rare case that may occur.
                    ethToSend = remainingToFulfill.divideDecimal(usdToEthPrice);

                    // We need to use send here instead of transfer because transfer reverts
                    // if the recipient is a non-payable contract. Send will just tell us it
                    // failed by returning false at which point we can continue.
                    // solium-disable-next-line security/no-send
                    if(!deposit.user.send(ethToSend)) {
                        fundsWallet.transfer(ethToSend);
                        emit NonPayableContract(deposit.user, ethToSend);
                    } else {
                        emit ClearedDeposit(msg.sender, deposit.user, ethToSend, remainingToFulfill, i);
                    }

                    // And the Synths to the recipient.
                    // Note: Fees are calculated by the Synth contract, so when
                    //       we request a specific transfer here, the fee is
                    //       automatically deducted and sent to the fee pool.
                    synth.transfer(msg.sender, remainingToFulfill);

                    // And we have nothing left to fulfill on this order.
                    remainingToFulfill = 0;
                } else if (deposit.amount <= remainingToFulfill) {
                    // We need to fulfill this one in its entirety and kick it out of the queue.
                    // Start by kicking it out of the queue.
                    // Free the storage because we can.
                    delete deposits[i];
                    // Bump our start index forward one.
                    depositStartIndex = depositStartIndex.add(1);
                    // We also need to tell our total it's decreased
                    totalSellableDeposits = totalSellableDeposits.sub(deposit.amount);

                    // Now fulfill by transfering the ETH to the depositor. Send is used instead of transfer
                    // so a non payable contract won't block the FIFO queue on a failed
                    // ETH payable for synths transaction. The proceeds to be sent to the
                    // synthetix foundation funds wallet. This is to protect all depositors
                    // in the queue in this rare case that may occur.
                    ethToSend = deposit.amount.divideDecimal(usdToEthPrice);

                    // We need to use send here instead of transfer because transfer reverts
                    // if the recipient is a non-payable contract. Send will just tell us it
                    // failed by returning false at which point we can continue.
                    // solium-disable-next-line security/no-send
                    if(!deposit.user.send(ethToSend)) {
                        fundsWallet.transfer(ethToSend);
                        emit NonPayableContract(deposit.user, ethToSend);
                    } else {
                        emit ClearedDeposit(msg.sender, deposit.user, ethToSend, deposit.amount, i);
                    }

                    // And the Synths to the recipient.
                    // Note: Fees are calculated by the Synth contract, so when
                    //       we request a specific transfer here, the fee is
                    //       automatically deducted and sent to the fee pool.
                    synth.transfer(msg.sender, deposit.amount);

                    // And subtract the order from our outstanding amount remaining
                    // for the next iteration of the loop.
                    remainingToFulfill = remainingToFulfill.sub(deposit.amount);
                }
            }
        }

        // Ok, if we're here and 'remainingToFulfill' isn't zero, then
        // we need to refund the remainder of their ETH back to them.
        if (remainingToFulfill > 0) {
            msg.sender.transfer(remainingToFulfill.divideDecimal(usdToEthPrice));
        }

        // How many did we actually give them?
        uint fulfilled = requestedToPurchase.sub(remainingToFulfill);

        if (fulfilled > 0) {
            // Now tell everyone that we gave them that many (only if the amount is greater than 0).
            emit Exchange("ETH", msg.value, "sUSD", fulfilled);
        }

        return fulfilled;
    }

    /**
     * @notice Exchange ETH to sUSD while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param guaranteedRate The exchange rate (ether price) which must be honored or the call will revert.
     */
    function exchangeEtherForSynthsAtRate(uint guaranteedRate)
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of Synths (sUSD) received
    {
        require(guaranteedRate == usdToEthPrice, "Guaranteed rate would not be received");

        return exchangeEtherForSynths();
    }


    /**
     * @notice Exchange ETH to SNX.
     */
    function exchangeEtherForSynthetix()
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of SNX received
    {
        // How many SNX are they going to be receiving?
        uint synthetixToSend = synthetixReceivedForEther(msg.value);

        // Store the ETH in our funds wallet
        fundsWallet.transfer(msg.value);

        // And send them the SNX.
        synthetix.transfer(msg.sender, synthetixToSend);

        emit Exchange("ETH", msg.value, "SNX", synthetixToSend);

        return synthetixToSend;
    }

    /**
     * @notice Exchange ETH to SNX while insisting on a particular set of rates. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rates.
     * @param guaranteedEtherRate The ether exchange rate which must be honored or the call will revert.
     * @param guaranteedSynthetixRate The synthetix exchange rate which must be honored or the call will revert.
     */
    function exchangeEtherForSynthetixAtRate(uint guaranteedEtherRate, uint guaranteedSynthetixRate)
        public
        payable
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of SNX received
    {
        require(guaranteedEtherRate == usdToEthPrice, "Guaranteed ether rate would not be received");
        require(guaranteedSynthetixRate == usdToSnxPrice, "Guaranteed synthetix rate would not be received");

        return exchangeEtherForSynthetix();
    }


    /**
     * @notice Exchange sUSD for SNX
     * @param synthAmount The amount of synths the user wishes to exchange.
     */
    function exchangeSynthsForSynthetix(uint synthAmount)
        public
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of SNX received
    {
        // How many SNX are they going to be receiving?
        uint synthetixToSend = synthetixReceivedForSynths(synthAmount);

        // Ok, transfer the Synths to our funds wallet.
        // These do not go in the deposit queue as they aren't for sale as such unless
        // they're sent back in from the funds wallet.
        synth.transferFrom(msg.sender, fundsWallet, synthAmount);

        // And send them the SNX.
        synthetix.transfer(msg.sender, synthetixToSend);

        emit Exchange("sUSD", synthAmount, "SNX", synthetixToSend);

        return synthetixToSend;
    }

    /**
     * @notice Exchange sUSD for SNX while insisting on a particular rate. This allows a user to
     *         exchange while protecting against frontrunning by the contract owner on the exchange rate.
     * @param synthAmount The amount of synths the user wishes to exchange.
     * @param guaranteedRate A rate (synthetix price) the caller wishes to insist upon.
     */
    function exchangeSynthsForSynthetixAtRate(uint synthAmount, uint guaranteedRate)
        public
        pricesNotStale
        notPaused
        returns (uint) // Returns the number of SNX received
    {
        require(guaranteedRate == usdToSnxPrice, "Guaranteed rate would not be received");

        return exchangeSynthsForSynthetix(synthAmount);
    }

    /**
     * @notice Allows the owner to withdraw SNX from this contract if needed.
     * @param amount The amount of SNX to attempt to withdraw (in 18 decimal places).
     */
    function withdrawSynthetix(uint amount)
        external
        onlyOwner
    {
        synthetix.transfer(owner, amount);

        // We don't emit our own events here because we assume that anyone
        // who wants to watch what the Issuance Controller is doing can
        // just watch ERC20 events from the Synth and/or Synthetix contracts
        // filtered to our address.
    }

    /**
     * @notice Allows a user to withdraw all of their previously deposited synths from this contract if needed.
     *         Developer note: We could keep an index of address to deposits to make this operation more efficient
     *         but then all the other operations on the queue become less efficient. It's expected that this
     *         function will be very rarely used, so placing the inefficiency here is intentional. The usual
     *         use case does not involve a withdrawal.
     */
    function withdrawMyDepositedSynths()
        external
    {
        uint synthsToSend = 0;

        for (uint i = depositStartIndex; i < depositEndIndex; i++) {
            synthDeposit memory deposit = deposits[i];

            if (deposit.user == msg.sender) {
                // The user is withdrawing this deposit. Remove it from our queue.
                // We'll just leave a gap, which the purchasing logic can walk past.
                synthsToSend = synthsToSend.add(deposit.amount);
                delete deposits[i];
                //Let the DApps know we've removed this deposit
                emit SynthDepositRemoved(deposit.user, deposit.amount, i);
            }
        }

        // Update our total
        totalSellableDeposits = totalSellableDeposits.sub(synthsToSend);

        // Check if the user has tried to send deposit amounts < the minimumDepositAmount to the FIFO
        // queue which would have been added to this mapping for withdrawal only
        synthsToSend = synthsToSend.add(smallDeposits[msg.sender]);
        smallDeposits[msg.sender] = 0;

        // If there's nothing to do then go ahead and revert the transaction
        require(synthsToSend > 0, "You have no deposits to withdraw.");

        // Send their deposits back to them (minus fees)
        synth.transfer(msg.sender, synthsToSend);

        emit SynthWithdrawal(msg.sender, synthsToSend);
    }

    /**
     * @notice depositSynths: Allows users to deposit synths via the approve / transferFrom workflow
     *         if they'd like. You can equally just transfer synths to this contract and it will work
     *         exactly the same way but with one less call (and therefore cheaper transaction fees)
     * @param amount The amount of sUSD you wish to deposit (must have been approved first)
     */
    function depositSynths(uint amount)
        external
    {
        // Grab the amount of synths
        synth.transferFrom(msg.sender, this, amount);

        // Note, we don't need to add them to the deposit list below, as the Synth contract itself will
        // call tokenFallback when the transfer happens, adding their deposit to the queue.
    }

    /**
     * @notice Triggers when users send us SNX or sUSD, but the modifier only allows sUSD calls to proceed.
     * @param from The address sending the sUSD
     * @param amount The amount of sUSD
     */
    function tokenFallback(address from, uint amount, bytes data)
        external
        onlySynth
        returns (bool)
    {
        // A minimum deposit amount is designed to protect purchasers from over paying
        // gas for fullfilling multiple small synth deposits
        if (amount < minimumDepositAmount) {
            // We cant fail/revert the transaction or send the synths back in a reentrant call.
            // So we will keep your synths balance seperate from the FIFO queue so you can withdraw them
            smallDeposits[from] = smallDeposits[from].add(amount);

            emit SynthDepositNotAccepted(from, amount, minimumDepositAmount);
        } else {
            // Ok, thanks for the deposit, let's queue it up.
            deposits[depositEndIndex] = synthDeposit({ user: from, amount: amount });
            emit SynthDeposit(from, amount, depositEndIndex);

            // Walk our index forward as well.
            depositEndIndex = depositEndIndex.add(1);

            // And add it to our total.
            totalSellableDeposits = totalSellableDeposits.add(amount);
        }
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
        return lastPriceUpdateTime.add(priceStalePeriod) < now;
    }

    /**
     * @notice Calculate how many SNX you will receive if you transfer
     *         an amount of synths.
     * @param amount The amount of synths (in 18 decimal places) you want to ask about
     */
    function synthetixReceivedForSynths(uint amount)
        public
        view
        returns (uint)
    {
        // How many synths would we receive after the transfer fee?
        uint synthsReceived = feePool.amountReceivedFromTransfer(amount);

        // And what would that be worth in SNX based on the current price?
        return synthsReceived.divideDecimal(usdToSnxPrice);
    }

    /**
     * @notice Calculate how many SNX you will receive if you transfer
     *         an amount of ether.
     * @param amount The amount of ether (in wei) you want to ask about
     */
    function synthetixReceivedForEther(uint amount)
        public
        view
        returns (uint)
    {
        // How much is the ETH they sent us worth in sUSD (ignoring the transfer fee)?
        uint valueSentInSynths = amount.multiplyDecimal(usdToEthPrice);

        // Now, how many SNX will that USD amount buy?
        return synthetixReceivedForSynths(valueSentInSynths);
    }

    /**
     * @notice Calculate how many synths you will receive if you transfer
     *         an amount of ether.
     * @param amount The amount of ether (in wei) you want to ask about
     */
    function synthsReceivedForEther(uint amount)
        public
        view
        returns (uint)
    {
        // How many synths would that amount of ether be worth?
        uint synthsTransferred = amount.multiplyDecimal(usdToEthPrice);

        // And how many of those would you receive after a transfer (deducting the transfer fee)
        return feePool.amountReceivedFromTransfer(synthsTransferred);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }

    modifier onlySynth
    {
        // We're only interested in doing anything on receiving sUSD.
        require(msg.sender == address(synth), "Only the synth contract can perform this action");
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
    event SynthUpdated(ISynth newSynthContract);
    event SynthetixUpdated(ISynthetix newSynthetixContract);
    event PriceStalePeriodUpdated(uint priceStalePeriod);
    event PricesUpdated(uint newEthPrice, uint newSynthetixPrice, uint timeSent);
    event Exchange(string fromCurrency, uint fromAmount, string toCurrency, uint toAmount);
    event SynthWithdrawal(address user, uint amount);
    event SynthDeposit(address indexed user, uint amount, uint indexed depositIndex);
    event SynthDepositRemoved(address indexed user, uint amount, uint indexed depositIndex);
    event SynthDepositNotAccepted(address user, uint amount, uint minimum);
    event MinimumDepositAmountUpdated(uint amount);
    event NonPayableContract(address indexed receiver, uint amount);
    event ClearedDeposit(address indexed fromAddress, address indexed toAddress, uint fromETHAmount, uint toAmount, uint indexed depositIndex);
}
