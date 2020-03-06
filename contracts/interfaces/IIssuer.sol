pragma solidity ^0.5.16;


interface IIssuer {
    function issueSynths(address from, uint amount) external;

    function issueMaxSynths(address from) external;

    function burnSynths(address from, uint amount) external;
}
