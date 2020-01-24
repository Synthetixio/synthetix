
pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Owned.sol";
import "./AddressResolver.sol";
import "./ExchangeState.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";

contract Exchanger is Owned {

    using SafeMath for uint;

    AddressResolver public resolver;

    uint public waitingPeriod = 3 minutes;

    bytes32 constant sUSD = "sUSD";

    constructor(address _owner)
        Owned(_owner)
        public
    {}

    function setResolver(AddressResolver _resolver) public onlyOwner {
        resolver = _resolver;
    }

    function exchangeState() public view returns (ExchangeState) {
        require(resolver.getAddress("ExchangeState") != address(0), "Resolver is missing ExchangeState address");
        return ExchangeState(resolver.getAddress("ExchangeState"));
    }

    function exchangeRates() public view returns (IExchangeRates) {
        require(resolver.getAddress("ExchangeRates") != address(0), "Resolver is missing ExchangeRates address");
        return IExchangeRates(resolver.getAddress("ExchangeRates"));
    }

    function synthetix() public view returns (ISynthetix) {
        require(resolver.getAddress("Synthetix") != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(resolver.getAddress("Synthetix"));
    }

    function feePool() public view returns (IFeePool) {
        require(resolver.getAddress("FeePool") != address(0), "Resolver is missing FeePool address");
        return IFeePool(resolver.getAddress("FeePool"));
    }

    function setWaitingPeriod(uint _waitingPeriod) external onlyOwner {
        waitingPeriod = _waitingPeriod;
    }

    /**
     * @notice Determine the effective fee rate for the exchange, taking into considering swing trading
     */
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        public
        view
        returns (uint)
    {
        // Get the base exchange fee rate
        uint exchangeFeeRate = feePool().exchangeFeeRate();

        uint multiplier = 1;

        // Is this a swing trade? I.e. long to short or vice versa, excluding when going into or out of sUSD.
        // Note: this assumes shorts begin with 'i' and longs with 's'.
        if (
            (sourceCurrencyKey[0] == 0x73 && sourceCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x69) ||
            (sourceCurrencyKey[0] == 0x69 && destinationCurrencyKey != sUSD && destinationCurrencyKey[0] == 0x73)
        ) {
            // If so then double the exchange fee multipler
            multiplier = 2;
        }

        return exchangeFeeRate.mul(multiplier);
    }

    function secsLeftInWaitingPeriodForExchange(uint timestamp) internal view returns (uint) {
        if (timestamp == 0) return 0;

        int remainingTime = int (now - timestamp - waitingPeriod);

        return remainingTime < 0 ? uint (-1 * remainingTime) : 0;
    }

    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) external view returns (uint) {
        return secsLeftInWaitingPeriodForExchange(exchangeState().getMaxTimestamp(account, currencyKey));
    }

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Only the synthetix contract can perform this action");
        _;
    }

    function appendExchange(address account, bytes32 src, uint amount, bytes32 dest, uint amountReceived) external onlySynthetix {
        IExchangeRates exRates = exchangeRates();
        uint roundIdForSrc = exRates.getCurrentRoundId(src);
        uint roundIdForDest = exRates.getCurrentRoundId(dest);
        exchangeState().appendExchangeEntry(account, src, amount, dest, amountReceived, now, roundIdForSrc, roundIdForDest);
    }

    function removeExchanges(address account, bytes32 currencyKey) external onlySynthetix {
        exchangeState().removeEntries(account, currencyKey);
    }

    function settlementOwing(address account, bytes32 currencyKey) external view returns (int) {

        int owing = 0;

        // Need to sum up all owings
        uint numEntries = exchangeState().getLengthOfEntries(account, currencyKey);

        for (uint i = 0; i < numEntries; i++) {

            (bytes32 src, uint amount, bytes32 dest, uint amountReceived,,,) = exchangeState().getEntryAt(account, currencyKey, i);

            (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd) = getRoundIdsAtPeriodEnd(account, currencyKey, i);

            uint destinationAmount = exchangeRates().effectiveValueAtRound(src, amount, dest, srcRoundIdAtPeriodEnd, destRoundIdAtPeriodEnd);

            (uint amountShouldHaveReceived, ) = synthetix().calculateExchangeAmountMinusFees(src, dest, destinationAmount);

            owing = owing + int (amountReceived - amountShouldHaveReceived);
        }

        return owing;

    }

    function getRoundIdsAtPeriodEnd(address account, bytes32 currencyKey, uint index) internal view returns (uint, uint) {
        (bytes32 src,, bytes32 dest,, uint timestamp, uint roundIdForSrc, uint roundIdForDest) = exchangeState().getEntryAt(account, currencyKey, index);

        IExchangeRates exRates = exchangeRates();
        uint srcRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(src, roundIdForSrc, timestamp, waitingPeriod);
        uint destRoundIdAtPeriodEnd = exRates.getLastRoundIdWhenWaitingPeriodEnded(dest, roundIdForDest, timestamp, waitingPeriod);

        return (srcRoundIdAtPeriodEnd, destRoundIdAtPeriodEnd);
    }
}
