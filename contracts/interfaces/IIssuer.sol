pragma solidity >=0.4.24;


interface IIssuer {
    // Views
    function canBurnSynths(address account) external view returns (bool);

    function debtBalanceOf(address issuer, bytes32 currencyKey) external view returns (uint);

    function debtBalanceOfAndTotalDebt(address issuer, bytes32 currencyKey)
        external
        view
        returns (uint debtBalance, uint totalSystemValue);

    function lastIssueEvent(address account) external view returns (uint);

    function maxIssuableSynths(address issuer) external view returns (uint maxIssuable);

    function remainingIssuableSynths(address issuer)
        external
        view
        returns (
            uint maxIssuable,
            uint alreadyIssued,
            uint totalSystemDebt
        );

    function totalIssuedSynths(bytes32 currencyKey, bool excludeEtherCollateral) external view returns (uint);

    // Restricted: used internally to Synthetix
    function issueSynths(address from, uint amount) external;

    function issueSynthsOnBehalf(
        address issueFor,
        address from,
        uint amount
    ) external;

    function issueMaxSynths(address from) external;

    function issueMaxSynthsOnBehalf(address issueFor, address from) external;

    function burnSynths(address from, uint amount) external;

    function burnSynthsOnBehalf(
        address burnForAddress,
        address from,
        uint amount
    ) external;

    function burnSynthsToTarget(address from) external;

    function burnSynthsToTargetOnBehalf(address burnForAddress, address from) external;
}
