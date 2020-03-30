pragma solidity 0.4.25;

/**
 * @title Synthetix interface contract
 * @notice Abstract contract to hold public getters
 * @dev pseudo interface, actually declared as contract to hold the public getters
 */
import "../interfaces/ISynthetixState.sol";
import "../interfaces/ISynth.sol";
import "../interfaces/ISynthetixEscrow.sol";
import "../interfaces/IFeePool.sol";
import "../interfaces/IExchangeRates.sol";
import "../Synth.sol";


contract ISynthetix {
    // ========== PUBLIC STATE VARIABLES ==========

    uint public totalSupply;

    mapping(bytes32 => Synth) public synths;

    mapping(address => bytes32) public synthsByAddress;

    // ========== PUBLIC FUNCTIONS ==========

    function balanceOf(address account) public view returns (uint);

    function transfer(address to, uint value) public returns (bool);

    function transferFrom(address from, address to, uint value) public returns (bool);

    function exchange(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        external
        returns (uint amountReceived);

    function issueSynths(uint amount) external;

    function issueMaxSynths() external;

    function burnSynths(uint amount) external;

    function burnSynthsToTarget() external;

    function settle(bytes32 currencyKey) external returns (uint reclaimed, uint refunded, uint numEntries);

    function collateralisationRatio(address issuer) public view returns (uint);

    function totalIssuedSynths(bytes32 currencyKey) public view returns (uint);

    function totalIssuedSynthsExcludeEtherCollateral(bytes32 currencyKey) public view returns (uint);

    function debtBalanceOf(address issuer, bytes32 currencyKey) public view returns (uint);

    function debtBalanceOfAndTotalDebt(address issuer, bytes32 currencyKey)
        public
        view
        returns (uint debtBalance, uint totalSystemValue);

    function remainingIssuableSynths(address issuer)
        public
        view
        returns (uint maxIssuable, uint alreadyIssued, uint totalSystemDebt);

    function maxIssuableSynths(address issuer) public view returns (uint maxIssuable);

    function isWaitingPeriod(bytes32 currencyKey) external view returns (bool);

    function emitSynthExchange(
        address account,
        bytes32 fromCurrencyKey,
        uint fromAmount,
        bytes32 toCurrencyKey,
        uint toAmount,
        address toAddress
    ) external;

    function emitExchangeReclaim(address account, bytes32 currencyKey, uint amount) external;

    function emitExchangeRebate(address account, bytes32 currencyKey, uint amount) external;
}
