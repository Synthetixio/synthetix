pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/ISynthetixDebtShare.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/contracts/synthetixdebtshare
contract SynthetixDebtShare is Owned, MixinResolver, ISynthetixDebtShare {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct PeriodBalance {
        uint128 amount;
        uint128 periodId;
    }

    bytes32 public constant CONTRACT_NAME = "SynthetixDebtShare";

    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    uint internal constant MAX_PERIOD_ITERATE = 10;

    /* ========== STATE VARIABLES ========== */

    /**
     * Addresses selected by owner which are allowed to call `transferFrom` to manage debt shares
     */
    mapping(address => bool) public authorizedBrokers;

    /**
     * Records a user's balance as it changes from period to period.
     * The last item in the array always represents the user's most recent balance
     * The intermediate balance is only recorded if 
     * `currentPeriodId` differs (which would happen upon a call to `setCurrentPeriodId`)
     */
    mapping(address => PeriodBalance[]) public balances;

    /**
     * Records totalSupply as it changes from period to period
     * Similar to `balances`, the `totalSupplyOnPeriod` at index `currentPeriodId` matches the current total supply
     * Any other period ID would represent its most recent totalSupply before the period ID changed.
     */
    mapping(uint => uint) public totalSupplyOnPeriod;


    /* ERC20 fields. */
    string public name;
    string public symbol;
    uint8 public decimals;

    /**
     * Period ID used for recording accounting changes
     * Can only increment
     */
    uint128 public currentPeriodId;


    bool public isInitialized = false;

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {
        name = "Synthetix Debt Shares";
        symbol = "SDS";
        decimals = 18;

        // NOTE: must match initial fee period ID on `FeePool` constructor if issuer wont report
        currentPeriodId = 1;
    }
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_ISSUER;
    }

    /* ========== VIEWS ========== */

    function balanceOf(address account) public view returns (uint) {
        uint accountPeriodHistoryCount = balances[account].length;

        if (accountPeriodHistoryCount == 0) {
            return 0;
        }

        return uint(balances[account][accountPeriodHistoryCount - 1].amount);
    }

    function balanceOfOnPeriod(address account, uint periodId) public view returns (uint) {
        uint accountPeriodHistoryCount = balances[account].length;

        int oldestHistoryIterate = int(MAX_PERIOD_ITERATE < accountPeriodHistoryCount ? accountPeriodHistoryCount - MAX_PERIOD_ITERATE : 0);
        int i;
        for (i = int(accountPeriodHistoryCount) - 1;i >= oldestHistoryIterate;i--) {
            if (balances[account][uint(i)].periodId <= periodId) {
                return uint(balances[account][uint(i)].amount);
            }
        }

        // if we got past the beginning of the history, then their balance is 0
        if (i < 0) {
            return 0;
        } else {
            revert("SynthetixDebtShare: not found in recent history");
        }
    }

    function totalSupply() public view returns (uint) {
        return totalSupplyOnPeriod[currentPeriodId];
    }

    function sharePercent(address account) external view returns (uint) {
        return sharePercentOnPeriod(account, currentPeriodId);
    }

    function sharePercentOnPeriod(address account, uint periodId) public view returns (uint) {
        uint balance = balanceOfOnPeriod(account, periodId);
        
        if (balance == 0) {
            return 0;
        }
        
        return balance.divideDecimal(totalSupplyOnPeriod[periodId]);
    }

    function allowance(address, address spender) public view returns (uint) {
        if (authorizedBrokers[spender]) {
            return uint(-1);
        }
        else {
            return 0;
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function addAuthorizedBroker(address authorizedBroker) external onlyOwner {
        authorizedBrokers[authorizedBroker] = true;
        emit ChangeAuthorizedBroker(authorizedBroker, true);
    }

    function removeAuthorizedBroker(address authorizedBroker) external onlyOwner {
        authorizedBrokers[authorizedBroker] = false;
        emit ChangeAuthorizedBroker(authorizedBroker, false);
    }

    function setCurrentPeriodId(uint128 newPeriodId) external onlyIssuer {
        require(newPeriodId > currentPeriodId, "period id must always increase");
        totalSupplyOnPeriod[newPeriodId] = totalSupplyOnPeriod[currentPeriodId];
        currentPeriodId = newPeriodId;
    }
        
    function mintShare(address account, uint256 amount) external onlyIssuer {
        require(account != address(0), "ERC20: mint to the zero address");

        _increaseBalance(account, amount);

        totalSupplyOnPeriod[currentPeriodId] = totalSupplyOnPeriod[currentPeriodId].add(amount);

        emit Transfer(address(0), account, amount);
        emit Mint(account, amount);
    }

    function burnShare(address account, uint256 amount) external onlyIssuer {
        require(account != address(0), "ERC20: mint to the zero address");

        _deductBalance(account, amount);

        totalSupplyOnPeriod[currentPeriodId] = totalSupplyOnPeriod[currentPeriodId].sub(amount);
        emit Transfer(account, address(0), amount);
        emit Burn(account, amount);
    }

    function approve(address, uint256) external pure returns(bool) {
        revert("debt shares are not transferrable");
    }

    function transfer(address, uint256) external pure returns(bool) {
        revert("debt shares are not transferrable");
    }

    function transferFrom(address from, address to, uint256 amount) external onlyAuthorizedBrokers returns(bool) {
        require(to != address(0), "ERC20: send to the zero address");

        _deductBalance(from, amount);
        _increaseBalance(to, amount);

        emit Transfer(address(from), address(to), amount);

        return true;
    }

    function importAddresses(address[] calldata accounts, uint256[] calldata amounts) external onlyOwner onlySetup {
        uint supply = totalSupplyOnPeriod[currentPeriodId];

        for (uint i = 0; i < accounts.length; i++) {
            _increaseBalance(accounts[i], amounts[i]);

            supply = supply.add(amounts[i]);

            emit Transfer(address(0), accounts[i], amounts[i]);
            emit Mint(accounts[i], amounts[i]);
        }

        totalSupplyOnPeriod[currentPeriodId] = supply;
    }

    function finishSetup() external onlyOwner {
        isInitialized = true;
    }

    /* ========== INTERNAL FUNCTIONS ======== */
    function _increaseBalance(address account, uint amount) internal {
        uint accountBalanceCount = balances[account].length;

        if (accountBalanceCount == 0) {
            balances[account].push(PeriodBalance(uint128(amount), uint128(currentPeriodId)));
        }
        else if (balances[account][accountBalanceCount - 1].periodId != currentPeriodId) {
            balances[account].push(PeriodBalance(
                uint128(uint(balances[account][accountBalanceCount - 1].amount).add(amount)), 
                currentPeriodId
            ));
        }
        else {
            balances[account][accountBalanceCount - 1].amount = 
                uint128(uint(balances[account][accountBalanceCount - 1].amount).add(amount));
        }
    }

    function _deductBalance(address account, uint amount) internal {
        uint accountBalanceCount = balances[account].length;

        require(accountBalanceCount != 0, "SynthetixDebtShare: account has no share to deduct");

        uint128 newAmount = uint128(uint(balances[account][accountBalanceCount - 1].amount).sub(amount));

        if (balances[account][accountBalanceCount - 1].periodId != currentPeriodId) {
            balances[account].push(PeriodBalance(
                newAmount, 
                currentPeriodId
            ));
        }
        else {
            balances[account][accountBalanceCount - 1].amount = newAmount;
        }
    }

    /* ========== MODIFIERS ========== */

    modifier onlyIssuer() {
        require(msg.sender == requireAndGetAddress(CONTRACT_ISSUER), "SynthetixDebtShare: only issuer can mint/burn");
        _;
    }

    modifier onlyAuthorizedBrokers() {
        require(authorizedBrokers[msg.sender], "SynthetixDebtShare: only brokers can transferFrom");
        _;
    }

    modifier onlySetup() {
        require(!isInitialized, "SynthetixDebt: only callable while still initializing");
        _;
    }

    /* ========== EVENTS ========== */
    event Mint(address indexed account, uint amount);
    event Burn(address indexed account, uint amount);
    event Transfer(address indexed from, address indexed to, uint value);

    event ChangeAuthorizedBroker(address indexed authorizedBroker, bool authorized);
}
