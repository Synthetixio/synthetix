pragma solidity 0.4.25;


interface IIssuer {
    function issueSynths(address from, uint amount) external;

    function issueSynthsOnBehalf(address issueFor, address from, uint amount) external;

    function issueMaxSynths(address from) external;

    function issueMaxSynthsOnBehalf(address issueFor, address from) external;

    function burnSynths(address from, uint amount) external;

    function burnSynthsOnBehalf(address burnForAddress, address from, uint amount) external;

    function burnSynthsToTarget(address from) external;

    function burnSynthsToTargetOnBehalf(address burnForAddress, address from) external;

    function canBurnSynths(address account) external view returns (bool);

    function lastIssueEvent(address account) external view returns (uint);
}
