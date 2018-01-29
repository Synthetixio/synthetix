FEATURES
========
* Factor out functionality from state, into proxy contract, for upgrades.
* Determine how to get tokens into contract and working with vesting schedules that still accrue fees.
* Confirm with Kain final values for all contract parameters.

TESTS
=====
Owned
Deploy
Havven
EtherNomin
Court
ERC20Token
ERC20FeeToken
Test inherited contracts (ERC20, Fee, Owned) in their inherited contexts
Account creation/unlocking logic for use in tests
Open new accounts per test instead of using web3.eth.accounts[1] etc.


CLEANUP
=======
* Remove the bullshit solcjs compilation logic. If it's needed use legit solc.
* Check if any multiplications/divisions can use the new safeMul, safeDiv functions
* Move test contracts into a contracts folder within test directory.
* Test events
* Switch to concise contract in testing suite if possible
* Ensure the deploy script actually optimises the files when compiling.
* NatSpec doc https://github.com/ethereum/wiki/wiki/Ethereum-Natural-Specification-Format https://github.com/ethereum/wiki/wiki/Natspec-Example
* make sure everything that should be settable has a setter
* make sure everything that should not be settable does not have a setter
* make sure everything that should be SDable is SDable
* make sure everything that needs an event has one
* Ensure function and member variable ordering is correct and consistent.
* Consider not disbursing fees to the havven contract itself while it possesses havvens which it has not endowed anyone with.
* check if modifiers are less efficient than inline conditions, reintroduce them if they aren't, maybe even factor all preconditions out into modifiers.
* Ensure documentation is up to date with functionality since changes.
* Merge double CALLs in CollateralisedNomin.confiscateBalance and similar elsewhere
* Check if can avoid ERC20 inheriting from SafeFixedMath due to inlined UNIT, and they only use addition and subtraction. (Maybe "Using For" or libs)
* Explicitly label pre- and post-condition checkers
* Determine whether SafeFixedMath library separate checks are necessary
* What happens with fee computations when multiple transactions occur in one block (zero time difference)
* Reentrancy checks
* Decide what to do about fallback functions
* Proper docstring/javadoc style comments, parameter descriptions
* http://solidity.readthedocs.io/en/latest/style-guide.html
* check access modifiers are correct
* check that all state-updating modifiers operate post-function-call.
* ensure everything that should be constant is constant.
* Update readme
* Update version numbers
* Better nomenclature for contracts, variables, and functions.
* Decide whether to apply postchecksCollateralisation modifier on nomin pool interactions
* Check relative performance of enums vs ints in the court.
* Check unchecked sends and so on
* Split fees for purchase versus sale?
* Work out which event parameters should be indexed (whether to add secondary fields to store actual value.).
* "Using for" statements where they make sense (if anywhere)
* Structs if and where they make sense
* Check that all calls out to other contracts are checked and handled in case of failure.
* Documentation on members
* Documentation on functions
* Documentation on files
* Add documented units where it makes sense
* Work out if we can add a fee field to Transfer events and still be ERC20 compliant
* ERC777? (if backwards compatible with ERC20)
* SafeFixedMath to a library?
* tabs to spaces
* Eliminate overwide lines
* Gas optimisation
* Add parameter names in contract ABIs for solidity-generated public functions.

VALIDATION
==========
* Desk check all functions.
* Test suite.
* Specify pre- and post-conditions for test suites (probably can't validate these at runtime due to cost.)
* Ensure that timestamp dependency is not a problem at our time scales; but if it is, switch to block numbers.
* Ensure functions correspond to correct state transitions in confiscation court
* Fee distribution
* Consensys best practices compliance.
* Solium lint.
* Invariants produced for every function
* Exceptional conditions for function descriptions
* mystake security suggestions
* etherscan.io bugs
* Compare with linked token implementations (zeppelin, consensys, minime).
* http://populus.readthedocs.io/en/latest/gotchas.html
* Re-verify that ERC20 compliant as per https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20-token-standard.md
* Joel + Mike + Dom + Sam + Matt contract read-through
* withdrawFeeEntitlement - test limits of multiplicaiton
* Ensure that denominators can never be zero.

MISC
====
* Staleness adjustments:
    - solve the trust problem of just setting low stale period and then liquidating
    - perhaps staleness protection for sell() is deactivated during the liquidation period
    - additionally make staleness predictable by emitting an event on update, and then requiring the current period to elapse before the stale period is actually changed.
    - rate limiting?
* Consider whether people emptying the collateral by hedging is a problem:
    Having no fee is effectively offering a short position for free. But if the volatility of ether is ~10% a day or so
    then a 10% fee required to make betting on it unprofitable is probably too high to get people to actually buy these things for their intended purpose.
    Probably can add a time lock for selling nomins back to the system, but it's awkward, and just makes the futures contract
    slightly longer term.

EXTENSIONS
==========
* withdrawal of your fees into a separate destination account
