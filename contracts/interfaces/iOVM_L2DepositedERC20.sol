// solhint-disable contract-name-camelcase
interface iOVM_L2DepositedERC20 {
    event WithdrawalInitiated(address indexed _from, address _to, uint256 _amount);

    event DepositFinalized(address indexed _to, uint256 _amount);

    function withdraw(uint _amount) external;

    function withdrawTo(address _to, uint _amount) external;

    function finalizeDeposit(address _to, uint _amount) external;
}
