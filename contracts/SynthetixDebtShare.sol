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
        uint amount;
        uint periodId;
    }

    bytes32 public constant CONTRACT_NAME = "SynthetixDebtShare";

    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    uint internal constant MAX_PERIOD_ITERATE = 10;

    /* ========== STATE VARIABLES ========== */

    mapping(address => bool) public authorizedBrokers;

    mapping(address => PeriodBalance[]) public balances;

    mapping(uint => uint) public totalSupplyOnPeriod;

    uint public currentPeriodId;

    /* ERC20 fields. */
    string public name;
    string public symbol;
    uint8 public decimals;

    bool public isInitialized = false;

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {
        name = "Synthetix Debt Shares";
        symbol = "SDS";
        decimals = 18;

        currentPeriodId = 0;
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

        return balances[account][accountPeriodHistoryCount - 1].amount;
    }

    function balanceOfOnPeriod(address account, uint periodId) public view returns (uint) {
        uint accountPeriodHistoryCount = balances[account].length;
        for (int i = int(accountPeriodHistoryCount) - 1;i >= int(MAX_PERIOD_ITERATE < accountPeriodHistoryCount ? accountPeriodHistoryCount - MAX_PERIOD_ITERATE : 0);i--) {
            if (balances[account][uint(i)].periodId <= periodId) {
                return balances[account][uint(i)].amount;
            }
        }
    }

    function totalSupply() public view returns (uint) {
        return totalSupplyOnPeriod[currentPeriodId];
    }

    function sharePercent(address account) external view returns (uint) {
        uint balance = balanceOf(account);

        if (balance == 0) {
            return 0;
        }

        return balance.divideDecimal(totalSupply());
    }

    function sharePercentOnPeriod(address account, uint periodId) external view returns (uint) {
        uint balance = balanceOfOnPeriod(account, periodId);
        
        if (balance == 0) {
            return 0;
        }
        
        return balance.divideDecimal(totalSupplyOnPeriod[periodId]);
    }

    function allowance(address account, address spender) public view returns (uint) {
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
    }

    function removeAuthorizedBroker(address authorizedBroker) external onlyOwner {
        authorizedBrokers[authorizedBroker] = false;
    }

    function setCurrentPeriodId(uint newPeriodId) external onlyIssuer {
        totalSupplyOnPeriod[newPeriodId] = totalSupplyOnPeriod[currentPeriodId];
        currentPeriodId = newPeriodId;
    }
        
    function mintShare(address account, uint256 amount) public onlyIssuer {
        require(account != address(0), "ERC20: mint to the zero address");

        _supplyBalance(account, amount);

        totalSupplyOnPeriod[currentPeriodId] = totalSupplyOnPeriod[currentPeriodId].add(amount);

        emit Transfer(address(0), account, amount);
        emit Mint(account, amount);
    }

    function burnShare(address account, uint256 amount) public onlyIssuer {
        require(account != address(0), "ERC20: mint to the zero address");

        _deductBalance(account, amount);

        totalSupplyOnPeriod[currentPeriodId] = totalSupplyOnPeriod[currentPeriodId].sub(amount);
        emit Transfer(account, address(0), amount);
        emit Burn(account, amount);
    }

    function approve(address spender, uint256 amount) external {
        revert("debt shares are not transferrable");
    }

    function transfer(address to, uint256 amount) external {
        revert("debt shares are not transferrable");
    }

    function transferFrom(address from, address to, uint256 amount) external onlyAuthorizedBrokers {
        _deductBalance(from, amount);
        _supplyBalance(to, amount);

        emit Transfer(address(from), address(to), amount);
    }

    function importAddresses(address[] calldata accounts, uint256[] calldata amounts) external onlyOwner onlySetup {
        for (uint i = 0; i < accounts.length; i++) {
            mintShare(accounts[i], amounts[i]);
        }
    }

    function finishSetup() external onlyOwner {
        isInitialized = true;
    }

    /* ========== INTERNAL FUNCTIONS ======== */
    function _supplyBalance(address account, uint amount) internal {
        uint accountBalanceCount = balances[account].length;

        if (accountBalanceCount == 0) {
            balances[account].push(PeriodBalance(amount, currentPeriodId));
        }
        else if (balances[account][accountBalanceCount - 1].periodId != currentPeriodId) {
            balances[account].push(PeriodBalance(balances[account][accountBalanceCount - 1].amount.add(amount), currentPeriodId));
        }
        else {
            balances[account][accountBalanceCount - 1].amount = balances[account][accountBalanceCount - 1].amount.add(amount);
        }
    }

    function _deductBalance(address account, uint amount) internal {
        uint accountBalanceCount = balances[account].length;

        if (accountBalanceCount == 0) {
            revert("SynthetixDebtShare: account has no share to deduct");
        }

        if (balances[account][accountBalanceCount - 1].periodId != currentPeriodId) {
            balances[account].push(PeriodBalance(balances[account][accountBalanceCount - 1].amount.sub(amount), currentPeriodId));
        }
        else {
            balances[account][accountBalanceCount - 1].amount = balances[account][accountBalanceCount - 1].amount.sub(amount);
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
}
