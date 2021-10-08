pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./State.sol";

// Libraries
import "./SafeDecimalMath.sol";

contract CollateralManagerState is Owned, State {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct Balance {
        uint128 long;
        uint128 short;
    }

    uint public totalLoans;

    uint[] public borrowRates;
    uint public borrowRatesLastUpdated;

    mapping(bytes32 => uint[]) public shortRates;
    mapping(bytes32 => uint) public shortRatesLastUpdated;

    // The total amount of long and short for a synth,
    mapping(bytes32 => Balance) public totalIssuedSynths;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {
        borrowRates.push(0);
        borrowRatesLastUpdated = block.timestamp;
    }

    function incrementTotalLoans() external onlyAssociatedContract returns (uint) {
        totalLoans = totalLoans.add(1);
        return totalLoans;
    }

    function long(bytes32 synth) external view onlyAssociatedContract returns (uint) {
        return uint(totalIssuedSynths[synth].long);
    }

    function short(bytes32 synth) external view onlyAssociatedContract returns (uint) {
        return uint(totalIssuedSynths[synth].short);
    }

    function longAndShort(bytes32 synth) external view onlyAssociatedContract returns (uint, uint) {
        Balance memory b = totalIssuedSynths[synth];
        return (uint(b.long), uint(b.short));
    }

    function incrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = uint128(uint(totalIssuedSynths[synth].long).add(amount));
    }

    function decrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = uint128(uint(totalIssuedSynths[synth].long).sub(amount));
    }

    function incrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = uint128(uint(totalIssuedSynths[synth].short).add(amount));
    }

    function decrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = uint128(uint(totalIssuedSynths[synth].short).sub(amount));
    }

    // Borrow rates, one array here for all currencies.

    function getRateAt(uint index) public view returns (uint) {
        return borrowRates[index];
    }

    function getRatesLength() public view returns (uint) {
        return borrowRates.length;
    }

    function updateBorrowRates(uint rate) external onlyAssociatedContract {
        borrowRates.push(rate);
        borrowRatesLastUpdated = block.timestamp;
    }

    function ratesLastUpdated() public view returns (uint) {
        return borrowRatesLastUpdated;
    }

    function getRatesAndTime(uint index)
        external
        view
        returns (
            uint entryRate,
            uint lastRate,
            uint lastUpdated,
            uint newIndex
        )
    {
        newIndex = getRatesLength();
        entryRate = getRateAt(index);
        lastRate = getRateAt(newIndex - 1);
        lastUpdated = ratesLastUpdated();
    }

    // Short rates, one array per currency.

    function addShortCurrency(bytes32 currency) external onlyAssociatedContract {
        if (shortRates[currency].length > 0) {} else {
            shortRates[currency].push(0);
            shortRatesLastUpdated[currency] = block.timestamp;
        }
    }

    function removeShortCurrency(bytes32 currency) external onlyAssociatedContract {
        delete shortRates[currency];
    }

    function getShortRateAt(bytes32 currency, uint index) internal view returns (uint) {
        return shortRates[currency][index];
    }

    function getShortRatesLength(bytes32 currency) public view returns (uint) {
        return shortRates[currency].length;
    }

    function updateShortRates(bytes32 currency, uint rate) external onlyAssociatedContract {
        shortRates[currency].push(rate);
        shortRatesLastUpdated[currency] = block.timestamp;
    }

    function shortRateLastUpdated(bytes32 currency) internal view returns (uint) {
        return shortRatesLastUpdated[currency];
    }

    function getShortRatesAndTime(bytes32 currency, uint index)
        external
        view
        returns (
            uint entryRate,
            uint lastRate,
            uint lastUpdated,
            uint newIndex
        )
    {
        newIndex = getShortRatesLength(currency);
        entryRate = getShortRateAt(currency, index);
        lastRate = getShortRateAt(currency, newIndex - 1);
        lastUpdated = shortRateLastUpdated(currency);
    }
}
