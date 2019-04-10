pragma solidity 0.4.25;

/**
 * @title Synthetix interface
 */
import "./ISynthetixState.sol";
import "./ISynth.sol";
import "./ISynthetixEscrow.sol";

interface ISynthetix {
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
    function getSynthetixState() public view returns (ISynthetixState);
    function getSynth(bytes4 currencyKey) public view returns (ISynth);
    function getRewardEscrow() public view returns (ISynthetixEscrow);
    function debtBalanceOf(address issuer, bytes4 currencyKey) public view returns (uint);
}
