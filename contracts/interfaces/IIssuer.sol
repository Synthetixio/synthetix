pragma solidity 0.4.25;


interface IIssuer {
    function issueSynths(address from, uint amount) external;

    function issueMaxSynths(address from) external;

    function burnSynths(address from, uint amount) external;
}
