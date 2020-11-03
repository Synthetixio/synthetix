pragma solidity >=0.4.24;

pragma experimental ABIEncoderV2;

interface IMultiCollateral {
    struct Loan {
        // ID for the loan
        uint256 id;
        //  Acccount that created the loan
        address payable account;
        //  Amount (in collateral token ) that they deposited
        uint256 collateral;
        // What currency did we denominate this loan in?
        // This can only be sUSD or the collateral type itself.
        bytes32 currency;
        //  Amount (in synths) that they issued to borrow
        uint256 amount;
        // Indicates whether this is a short position
        bool short;
        // Minting Fee
        uint256 mintingFee;
        // interest amounts accrued
        uint256 accruedInterest;
        // last interest index
        uint256 interestIndex;
    }
}