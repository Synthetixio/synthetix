pragma solidity 0.4.25;

import "../Owned.sol";
import "../Synthetix.sol";
import "../FeePool.sol";
import "../IERC20.sol";

contract TokenExchanger is Owned {

    Synthetix public synthetix;

    constructor(address _owner, Synthetix _synthetix)
        Owned(_owner)
        public
    {
        synthetix = _synthetix;
    }

    function setSynthetix(Synthetix _synthetix)
        external
        onlyOwner
    {
        synthetix = _synthetix;
    }

    function checkBalance(address account)
        public
        synthetixIsSet
        returns (uint)
    {
        return IERC20(synthetix).balanceOf(account);
    }

    function amountReceivedFromExchange(uint amount)
        public
        synthetixIsSet
        returns (uint)
    {
        // Get FeePool address
        FeePool feePool = FeePool(synthetix.feePool());
        return feePool.amountReceivedFromExchange(amount);
    }

    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey)
        public
        synthetixIsSet
        returns (bool)
    {
        // Get my balance
        uint mybalance = IERC20(synthetix).balanceOf(msg.sender);

        // Get FeePool address
        FeePool feePool = FeePool(synthetix.feePool());

        // Get exchangeFeeRate
        uint exchangeFeeRate = feePool.exchangeFeeRate();
        uint maxRate = 5000000000000000;
        require(exchangeFeeRate < maxRate, "Not paying more than that");

        // Check my amount Received From Exchange
        uint amountReceivedFromExchange = feePool.amountReceivedFromExchange(mybalance);
        require(amountReceivedFromExchange > 0, "No sipping");

        // Do the exchange
        return synthetix.exchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey, msg.sender);
    }

    modifier synthetixIsSet {
        require(synthetix != address(0), "synthetix contract address not set");
        _;
    }
}
