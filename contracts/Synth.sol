pragma solidity 0.4.25;

import "./ExternStateToken.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IIssuer.sol";
import "./Proxy.sol";
import "./MixinResolver.sol";


contract Synth is ExternStateToken, MixinResolver {
    /* ========== STATE VARIABLES ========== */

    // Currency key which identifies this Synth to the Synthetix system
    bytes32 public currencyKey;

    uint8 public constant DECIMALS = 18;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _proxy,
        TokenState _tokenState,
        string _tokenName,
        string _tokenSymbol,
        address _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver
    )
        public
        ExternStateToken(_proxy, _tokenState, _tokenName, _tokenSymbol, _totalSupply, DECIMALS, _owner)
        MixinResolver(_owner, _resolver)
    {
        require(_proxy != address(0), "_proxy cannot be 0");
        require(_owner != 0, "_owner cannot be 0");

        currencyKey = _currencyKey;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function transfer(address to, uint value) public optionalProxy returns (bool) {
        _ensureCanTransfer(messageSender, value);

        return super._internalTransfer(messageSender, to, value);
    }

    function transferAndSettle(address to, uint value) public optionalProxy returns (bool) {
        exchanger().settle(messageSender, currencyKey);

        return super._internalTransfer(messageSender, to, value);
    }

    function transferFrom(address from, address to, uint value) public optionalProxy returns (bool) {
        _ensureCanTransfer(from, value);

        return _internalTransferFrom(from, to, value);
    }

    function transferFromAndSettle(address from, address to, uint value) public optionalProxy returns (bool) {
        exchanger().settle(from, currencyKey);

        return _internalTransferFrom(from, to, value);
    }

    // Allow synthetix to issue a certain number of synths from an account.
    function issue(address account, uint amount) external onlyInternalContracts {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);
        emitTransfer(address(0), account, amount);
        emitIssued(account, amount);
    }

    // Allow synthetix or another synth contract to burn a certain number of synths from an account.
    function burn(address account, uint amount) external onlyInternalContracts {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emitTransfer(account, address(0), amount);
        emitBurned(account, amount);
    }

    // Allow owner to set the total supply on import.
    function setTotalSupply(uint amount) external optionalProxy_onlyOwner {
        totalSupply = amount;
    }

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        require(resolver.getAddress("Synthetix") != address(0), "Resolver is missing Synthetix address");
        return ISynthetix(resolver.getAddress("Synthetix"));
    }

    function feePool() internal view returns (IFeePool) {
        require(resolver.getAddress("FeePool") != address(0), "Resolver is missing FeePool address");
        return IFeePool(resolver.getAddress("FeePool"));
    }

    function exchanger() internal view returns (IExchanger) {
        require(resolver.getAddress("Exchanger") != address(0), "Resolver is missing Exchanger address");
        return IExchanger(resolver.getAddress("Exchanger"));
    }

    function issuer() internal view returns (IIssuer) {
        require(resolver.getAddress("Issuer") != address(0), "Resolver is missing Issuer address");
        return IIssuer(resolver.getAddress("Issuer"));
    }

    function _ensureCanTransfer(address from, uint value) internal view {
        IExchanger _exchanger = exchanger();
        require(
            _exchanger.maxSecsLeftInWaitingPeriod(from, currencyKey) == 0,
            "Cannot transfer during waiting period"
        );
        require(transferableSynths(from) >= value, "Transfer requires settle");
    }

    function transferableSynths(address account) public view returns (uint) {
        (uint reclaimAmount, ) = exchanger().settlementOwing(account, currencyKey);

        // Note: ignoring rebate amount here because a settle() is required in order to
        // allow the transfer to actually work

        uint balance = tokenState.balanceOf(account);

        if (reclaimAmount > balance) {
            return 0;
        } else {
            return balance.sub(reclaimAmount);
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _internalTransferFrom(address from, address to, uint value) internal returns (bool) {
        // Skip allowance update in case of infinite allowance
        if (tokenState.allowance(from, messageSender) != uint(-1)) {
            // Reduce the allowance by the amount we're transferring.
            // The safeSub call will handle an insufficient allowance.
            tokenState.setAllowance(from, messageSender, tokenState.allowance(from, messageSender).sub(value));
        }

        return super._internalTransfer(from, to, value);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyInternalContracts() {
        bool isSynthetix = msg.sender == address(synthetix());
        bool isFeePool = msg.sender == address(feePool());
        bool isExchanger = msg.sender == address(exchanger());
        bool isIssuer = msg.sender == address(issuer());

        require(
            isSynthetix || isFeePool || isExchanger || isIssuer,
            "Only Synthetix, FeePool, Exchanger or Issuer contracts allowed"
        );
        _;
    }

    /* ========== EVENTS ========== */
    event Issued(address indexed account, uint value);
    bytes32 private constant ISSUED_SIG = keccak256("Issued(address,uint256)");

    function emitIssued(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, ISSUED_SIG, bytes32(account), 0, 0);
    }

    event Burned(address indexed account, uint value);
    bytes32 private constant BURNED_SIG = keccak256("Burned(address,uint256)");

    function emitBurned(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, BURNED_SIG, bytes32(account), 0, 0);
    }
}
