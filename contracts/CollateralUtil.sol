pragma solidity ^0.5.16;

// Inheritance
import "./MixinSystemSettings.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ICollateralLoan.sol";
import "./interfaces/IExchangeRates.sol";

// Internal references
import "./CollateralState.sol";

import "./SafeDecimalMath.sol";

contract CollateralUtil is ICollateralLoan {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant sUSD = "sUSD";

    IAddressResolver public addressResolverProxy;

    // Stores loans
    CollateralState public state;

    // The synth corresponding to the collateral.
    bytes32 public collateralKey;

    address public collateral;

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(addressResolverProxy.requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates contract"));
    }

    constructor(
        CollateralState _state,
        address _resolver,
        address _collateral,
        bytes32 _collateralKey
    ) public {
        state = _state;
        addressResolverProxy = IAddressResolver(_resolver);
        collateral = _collateral;
        collateralKey = _collateralKey;
    }

    function _collateralRatio(uint id, address account) internal returns (uint cratio) {
        Loan memory loan = state.getLoan(account, id);
        uint cvalue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint dvalue = _exchangeRates().effectiveValue(loan.currency, loan.amount.add(loan.accruedInterest), sUSD);
        return cvalue.divideDecimal(dvalue);
    }

    function _amount(uint id, address account) internal returns (uint amount) {
        return state.getLoan(account, id).amount;
    }

    function _collateral(uint id, address account) internal returns (uint collateral) {
        return state.getLoan(account, id).collateral;
    }

    function collateralizationInfo(uint id, address account)
        external
        view
        returns (
            uint,
            uint,
            uint
        )
    {
        uint cratio = _collateralRatio(id, account);
        uint amount = _amount(id, account);
        uint collateral = _collateral(id, account);
        return (cratio, amount, collateral);
    }

    function getCollateralRatio(uint id, address account) external view returns (uint cratio) {
        return _collateralRatio(id, account);
    }

    function getAmount(uint id, address account) external view returns (uint amount) {
        return _amount(id, account);
    }

    function getCollateral(uint id, address account) external view returns (uint collateral) {
        return _collateral(id, account);
    }

    function getAccount(uint id) external view returns (address account) {
        return state.getLoan(account, id).account;
    }

    function getCurrency(uint id, address account) external view returns (bytes32 currency) {
        return state.getLoan(account, id).currency;
    }

    function getAccruedInterest(uint id, address account) external view returns (uint accruedInterest) {
        return state.getLoan(account, id).accruedInterest;
    }

    function getInterestIndex(uint id, address account) external view returns (uint interestIndex) {
        return state.getLoan(account, id).interestIndex;
    }

    function getLastInteraction(uint id, address account) external view returns (uint lastInteraction) {
        return state.getLoan(account, id).lastInteraction;
    }

    function isLoanShort(uint id, address account) external view returns (bool short) {
        return state.getLoan(account, id).short;
    }
}
