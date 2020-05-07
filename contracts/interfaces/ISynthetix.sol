pragma solidity ^0.5.16;

import "../interfaces/ISynth.sol";


interface ISynthetix {
    // Views
    function synths(bytes32 currencyKey) external view returns (ISynth);

    function synthsByAddress(address synthAddress) external view returns (bytes32);

    function collateralisationRatio(address issuer) external view returns (uint);

    function totalIssuedSynths(bytes32 currencyKey) external view returns (uint);

    function totalIssuedSynthsExcludeEtherCollateral(bytes32 currencyKey) external view returns (uint);

    function debtBalanceOf(address issuer, bytes32 currencyKey) external view returns (uint);

    function debtBalanceOfAndTotalDebt(address issuer, bytes32 currencyKey)
        external
        view
        returns (uint debtBalance, uint totalSystemValue);

    function remainingIssuableSynths(address issuer)
        external
        view
        returns (
            uint maxIssuable,
            uint alreadyIssued,
            uint totalSystemDebt
        );

    function maxIssuableSynths(address issuer) external view returns (uint maxIssuable);

    function isWaitingPeriod(bytes32 currencyKey) external view returns (bool);

    // Mutative Functions
    function exchange(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external returns (uint amountReceived);

    function issueSynths(uint amount) external;

    function issueMaxSynths() external;

    function burnSynths(uint amount) external;

    function burnSynthsToTarget() external;

    function settle(bytes32 currencyKey)
        external
        returns (
            uint reclaimed,
            uint refunded,
            uint numEntries
        );
}
