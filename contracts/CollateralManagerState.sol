pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./State.sol";
import "./interfaces/ICollateral.sol";

// Libraries
import "./SafeDecimalMath.sol";

contract CollateralManagerState is Owned, State {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct Balance {
        uint long;
        uint short;
    }

    uint[] public borrowRates;

    uint public borrowRatesLastUpdated;

    // The total amount of long and short for a synth,
    mapping(bytes32 => Balance) public totalIssuedSynths;

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {
        borrowRates.push(0);
        borrowRatesLastUpdated = block.timestamp;
    }

    function long(bytes32 synth) external view onlyAssociatedContract returns (uint) {
        return totalIssuedSynths[synth].long;
    }

    function short(bytes32 synth) external view onlyAssociatedContract returns (uint) {
        return totalIssuedSynths[synth].short;
    } 

    function incrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = totalIssuedSynths[synth].long.add(amount);
    }

    function decrementLongs(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].long = totalIssuedSynths[synth].long.sub(amount);
    }

    function incrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = totalIssuedSynths[synth].short.add(amount);
    }

    function decrementShorts(bytes32 synth, uint256 amount) external onlyAssociatedContract {
        totalIssuedSynths[synth].short = totalIssuedSynths[synth].short.sub(amount);
    }

    function getRateAt(uint index) public view returns(uint) {
        return borrowRates[index];
    }

    function getRatesLength() public view returns(uint) {
        return borrowRates.length;
    }

    function updateBorrowRates(uint rate) public {
        borrowRates.push(rate);
        borrowRatesLastUpdated = block.timestamp;
    }

    function ratesLastUpdated() public view returns(uint) {
        return borrowRatesLastUpdated;
    }

    function getRatesAndTime(uint index) external view returns(uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) {
        newIndex = getRatesLength();
        entryRate = getRateAt(index);
        lastRate = getRateAt(newIndex - 1);
        lastUpdated = ratesLastUpdated();
    }
}