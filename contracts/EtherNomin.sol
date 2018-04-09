/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       EtherNomin.sol
version:    1.0
author:     Anton Jurisevic
            Mike Spain

date:       2018-2-28

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Ether-backed nomin stablecoin contract.

This contract issues nomins, which are tokens worth 1 USD each. They are backed
by a pool of ether collateral, so that if a user has nomins, they may
redeem them for ether from the pool, or if they want to obtain nomins,
they may pay ether into the pool in order to do so.

The supply of nomins that may be in circulation at any time is limited.
The contract owner may increase this quantity, but only if they provide
ether to back it. The backing the owner provides at issuance must
keep each nomin at least twice overcollateralised.
The owner may also destroy nomins in the pool, which is potential avenue
by which to maintain healthy collateralisation levels, as it reduces
supply without withdrawing ether collateral.

A configurable fee is charged on nomin transfers and deposited
into a common pot, which havven holders may withdraw from once per
fee period.

Ether price is continually updated by an external oracle, and the value
of the backing is computed on this basis. To ensure the integrity of
this system, if the contract's price has not been updated recently enough,
it will temporarily disable itself until it receives more price information.

The contract owner may at any time initiate contract liquidation.
During the liquidation period, most contract functions will be deactivated.
No new nomins may be issued or bought, but users may sell nomins back
to the system.
If the system's collateral falls below a specified level, then anyone
may initiate liquidation.

After the liquidation period has elapsed, which is initially 90 days,
the owner may destroy the contract, transferring any remaining collateral
to a nominated beneficiary address.
This liquidation period may be extended up to a maximum of 180 days.
If the contract is recollateralised, the owner may terminate liquidation.

-----------------------------------------------------------------
*/

pragma solidity 0.4.21;


import "contracts/ExternStateFeeToken.sol";
import "contracts/TokenState.sol";
import "contracts/Court.sol";
import "contracts/Havven.sol";


contract EtherNomin is ExternStateFeeToken {

    /* ========== STATE VARIABLES ========== */

    // The address of the contract which manages confiscation votes.
    Court public court;
    Havven public havven;

    // Accounts which have lost the privilege to transact in nomins.
    mapping(address => bool) public frozen;


    /* ========== CONSTRUCTOR ========== */

    function EtherNomin(address _havven,
                        uint _initialEtherPrice,
                        address _owner, TokenState _initialState)
        ExternStateFeeToken("Havven-Backed USD Nomins", "nUSD",
                            15 * UNIT / 10000, // nomin transfers incur a 15 bp fee
                            _havven, // the havven contract is the fee authority
                            _initialState,
                            _owner)
        public
    {
        // It should not be possible to transfer to the nomin contract itself.
        frozen[this] = true;
    }

    /* ========== SETTERS ========== */

    function setCourt(Court _court)
        external
        onlyOwner
    {
        court = _court;
        emit CourtUpdated(_court);
    }

    function setHavven(Havven _havven)
        external
        onlyOwner
    {
        havven = _havven;
        emit HavvenUpdated(_havven);
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Override ERC20 transfer function in order to check
     * whether the recipient account is frozen. Note that there is
     * no need to check whether the sender has a frozen account,
     * since their funds have already been confiscated,
     * and no new funds can be transferred to it.*/
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        require(!frozen[to]);
        return super.transfer(to, value);
    }

    /* Override ERC20 transferFrom function in order to check
     * whether the recipient account is frozen. */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        require(!frozen[to]);
        return super.transferFrom(from, to, value);
    }

    /* If a confiscation court motion has passed and reached the confirmation
     * state, the court may transfer the target account's balance to the fee pool
     * and freeze its participation in further transactions. */
    function confiscateBalance(address target)
        external
    {
        // Should be callable only by the confiscation court.
        require(Court(msg.sender) == court);
        
        // A motion must actually be underway.
        uint motionID = court.targetMotionID(target);
        require(motionID != 0);

        // These checks are strictly unnecessary,
        // since they are already checked in the court contract itself.
        require(court.motionConfirming(motionID));
        require(court.motionPasses(motionID));
        require(!frozen[target]);

        // Confiscate the balance in the account and freeze it.
        uint balance = state.balanceOf(target);
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), balance));
        state.setBalanceOf(target, 0);
        frozen[target] = true;
        emit AccountFrozen(target, target, balance);
        emit Transfer(target, address(this), balance);
    }

    /* The owner may allow a previously-frozen contract to once
     * again accept and transfer nomins. */
    function unfreezeAccount(address target)
        external
        onlyOwner
    {
        if (frozen[target] && EtherNomin(target) != this) {
            frozen[target] = false;
            emit AccountUnfrozen(target, target);
        }
    }

    function burn(address target, uint amount)
        external
        onlyHavven
    {
        // assume Havven contract has checked issued nomin amount
        state.setBalanceOf(target, safeSub(state.balanceOf(target), amount));
        totalSupply = safeSub(totalSupply, amount);
        emit Transfer(target, address(0), amount);
        emit BurnedNomins(target, amount);
    }

    function issue(address target, uint amount)
        external
        onlyHavven
    {
        // assume Havven contract is only issuing valid amounts
        state.setBalanceOf(target, safeAdd(state.balanceOf(target), amount));
        totalSupply = safeAdd(totalSupply, amount);
        emit Transfer(address(0), target, amount);
        emit IssuedNomins(target, amount);
    }


    /* ========== MODIFIERS ========== */

    modifier onlyHavven() {
        require(Havven(msg.sender) == havven);
        _;
    }


    /* ========== EVENTS ========== */

    event CourtUpdated(address newCourt);

    event HavvenUpdated(address havven);

    event AccountFrozen(address target, address indexed targetIndex, uint balance);

    event AccountUnfrozen(address target, address indexed targetIndex);

    event IssuedNomins(address target, uint amount);

    event BurnedNomins(address target, uint amount);
}
