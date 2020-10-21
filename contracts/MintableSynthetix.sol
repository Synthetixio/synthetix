pragma solidity ^0.5.16;

// Inheritance
import "./Synthetix.sol";


contract MintableSynthetix is Synthetix {
    bytes32 private constant CONTRACT_SECONDARYDEPOSIT = "SecondaryDeposit";

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        address _owner,
        uint _totalSupply,
        address _resolver
    ) public Synthetix(_proxy, _tokenState, _owner, _totalSupply, _resolver) {
        appendToAddressCache(CONTRACT_SECONDARYDEPOSIT);
    }

    /* ========== VIEWS ======================= */

    function secondaryDeposit() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SECONDARYDEPOSIT, "Resolver is missing SecondaryDeposit address");
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function mintSecondary(address account, uint amount) external {
        require(msg.sender == secondaryDeposit(), "Can only be invoked by the SecondaryDeposit contract");

        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        emitTransfer(address(this), account, amount);
        totalSupply = totalSupply.add(amount);
    }

    function burnSecondary(address account, uint amount) external {
        require(msg.sender == secondaryDeposit(), "Can only be invoked by the SecondaryDeposit contract");

        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        emitTransfer(account, address(0), amount);
        totalSupply = totalSupply.sub(amount);
    }
}
