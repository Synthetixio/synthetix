pragma solidity >=0.4.21 <0.6.0;


import "./StakingPool.sol";
//import "./Proxy.sol";
import "./Owned.sol";

/**
 * @title StakingPoolFacotry.
 * @notice This contracts deploys proxied instances of StakingPools
 */
contract StakingPoolFacotry is Owned{

    event PoolDeployed(address stakingPool, address manager);

    address target;
    address synthetix;
    address feePool;
    address rewardEscrow;
    address depot;

      /**
     * @dev Constructor
     * @param _target A deployed contract the will serve as target for delegateCalls from contracts deployed via this factpry
     * @param _synthetix The address of Synthetix contract.
     * @param _feePool The address of feePool contract.
     * @param _rEscrow The address of rewards escrow contract.
     * @param _depot The address of depot contract.
     */
    constructor(address _target,address _synthetix, address _feePool, address _rEscrow, address _depot) Owned(msg.sender) {
        target = _target;
        synthetix = _synthetix;
        feePool = _feePool;
        rewardEscrow = _rEscrow;
        depot = _depot;
    }

    /**
     * @dev Deploys a new instance of a staking pool
     * @param _manager The address of the manager
     * @param _fee The percent fee taken on claimedFees. Examples: 100 = 1% , 1 = 0.01%, 100000 = 100%
     * @param _delay The time in days it takes for some actions to take effect.
     */
    function deployStakingPool(address _manager, uint256 _fee, uint256 _delay) public returns (address pool) {
        pool = new StakingPoolProxy(target, _manager, synthetix, feePool, rewardEscrow, depot, _fee, _delay);
        emit PoolDeployed(pool, _manager);
    }

    /**
     * @dev Updates the contract references passed through new deployed instances
     * @param _target A deployed contract the will serve as target for delegateCalls from contracts deployed via this factpry
     * @param _synthetix The address of Synthetix contract.
     * @param _feePool The address of feePool contract.
     * @param _rEscrow The address of rewards escrow contract.
     * @param _depot The address of depot contract.
     */
    function updateSystemContracts(address _target, address _synthetix, address _feePool, address _rEscrow, address _depot) public onlyOwner {
        target = _target;
        synthetix = _synthetix;
        feePool = _feePool;
        rewardEscrow = _rEscrow;
        depot = _depot;
    }

}

/**
 * @title StakingPoolProxy
 * @notice This are the instances that will be deployed. They have storage slots and a function to forward incoming calls to the target address
 */
contract StakingPoolProxy is StakingPoolStorage{
    address public target;

    /**
     * @dev Constructor
     * @param _target A deployed contract the will serve as target for delegateCalls from contracts deployed via this factpry
     * @param _manager The address of the manager
     * @param _synthetix The address of Synthetix contract.
     * @param _feePool The address of feePool contract.
     * @param _rEscrow The address of rewards escrow contract.
     * @param _depot The address of depot contract.
     * @param _fee The percent fee taken on claimedFees. Examples: 100 = 1% , 1 = 0.01%, 100000 = 100%
     * @param _delay The time in days it takes for some actions to take effect.
     */
    constructor(address _target, address _manager, address _synthetix, address _feePool, address _rEscrow, address _depot, uint256 _fee, uint256 _delay) public {
        require(_fee <= HUNDRED_PERCENT, "Fee must smaller than 100%");
        require(_delay != 0, "Delay must be at elast 1");
        target = _target;
        manager = _manager;
        synthetix = Synthetix(_synthetix);
        feePool = FeePool(_feePool);
        rewardEscrow = RewardEscrow(_rEscrow);
        depot = Depot(_depot);
        fee = _fee;
        delay = _delay * 1 days;
    }

    /**
     * @dev A function that fowards any incoming transaction to _atrget address
     * 
     */
    function()
        external
    {
        assembly {
            /* Copy call data into free memory region. */
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* Forward all gas and call data to the target contract. */
            let result := delegatecall(gas, sload(target_slot), free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            /* Revert if the call failed, otherwise return the result. */
            if iszero(result) { revert(free_ptr, returndatasize) }
            return(free_ptr, returndatasize)
        }
    }
}