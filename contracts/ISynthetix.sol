pragma solidity 0.4.25;

/**
 * @title Synthetix interface contract
 * @dev pseudo interface, actually declared as contract to hold the public getters 
 */
import "./ISynthetixState.sol";
import "./ISynth.sol";
import "./ISynthetixEscrow.sol";
import "./IFeePool.sol";
import "./IExchangeRates.sol";

contract ISynthetix {

    // ========== PUBLIC STATE VARIABLES ==========

    IFeePool public feePool;
    ISynthetixEscrow public escrow;
    ISynthetixEscrow public rewardEscrow;
    ISynthetixState public synthetixState;
    IExchangeRates public exchangeRates;

    // ========== PUBLIC FUNCTIONS ==========

    function balanceOf(address account) public view returns (uint);
    function transfer(address to, uint value) public returns (bool);
    function effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey) public view returns (uint);

    function synthInitiatedFeePayment(address from, bytes4 sourceCurrencyKey, uint sourceAmount) external returns (bool);
    function synthInitiatedExchange(
        address from,
        bytes4 sourceCurrencyKey,
        uint sourceAmount,
        bytes4 destinationCurrencyKey,
        address destinationAddress) external returns (bool);
    function collateralisationRatio(address issuer) public view returns (uint);
    function totalIssuedSynths(bytes4 currencyKey)
        public
        view
        returns (uint);
    function getSynth(bytes4 currencyKey) public view returns (ISynth);
    function debtBalanceOf(address issuer, bytes4 currencyKey) public view returns (uint);
}
