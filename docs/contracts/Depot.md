# Depot

## Notes

Assumes that the Synth price is worth US\$1. So: a) this will only work with `sUSD`. b) there's a profit opportunity if the `sUSD` is off its peg.

NOTE: Some of this code is lifted verbatim from the old EtherNomin code, but this isn't indicated in the licence header.

## Inherited Contracts

* [SelfDestructible](SelfDestructible.md)
* [Pausable](Pausable.md)
* ^[State](State.md)
* ^[Owned](Owned.md)

## Related Contracts

### Referenced

* [Synthetix](Synthetix.md)
* [Synth](Synth.md)
* [FeePool](FeePool.md)
* [SafeDecimalMath](SafeDecimalMath.md)
* SafeMath

### Referencing

## Structs

```solidity
struct synthDeposit {
    address user; // depositor
    uint amount; // synth deposit size
}
```

## Variables

* `fundsWallet: address public`: The address where ether and synths raised by selling SNX are sent.
* `oracle: address public`: The USD price oracle for SNX and ether.
* `ORACLE_FUTURE_LIMIT: uint public constant`: 10 minutes. The oracle can submit prices no further in the future than this.
* `priceStalePeriod: uint public`: It is assumed the known price is out of date if older than this. Initialised to 3 hours.
* `lastPriceUpdateTime: uint public`: The last time prices were updated.
* `usdToSnxPrice: uint public`: Fixed point decimal, the unit is equivalent to 10^18.
* `usdToEthPrice: uint public`: As `usdToSnxPrice`.
* `deposits: mapping(uint => synthDeposit) public`: a mapping from indices to deposits: stores a contiguous sequence of deposits, which are processed in queue order.
* `depositStartIndex: uint public`: the index of the next deposit to be processed in the queue.
* `depositEndIndex: uint public`: the index one past the last deposit in the queue.
* `totalSellableDeposits: uint public`: The total quantity of synths currently in the queue.
* `minimumDepositAmount: uint public`: The minimum sUSD quantity required for a deposit to added to the queue. Initialised to 50 * `UNIT`.
* `smallDeposits: mapping(address => uint) public`: Keeps track of deposits less than `minimumDepositAmount` and allows the depositor to withdraw them.

## Functions

* `setFundsWallet(address _fundsWallet)`: Only callable by the contract owner.
* `setOracle(address _oracle)`: Only callable by the contract owner.
* `setSynth(Synth _synth)`: Only callable by the contract owner.
* `setSynthetix(Synthetix _synthetix)`: Only callable by the contract owner.
* `setPriceStalePeriod(uint _time)`: Only callable by the contract owner.
* `setMinimumDepositAmount(uint _amount)`: Only callable by the contract owner. `_amount` must be greater than `UNIT`.
* `updatePrices(uint newEthPrice, uint newSynthetixPrice, uint timeSent)`: Only callable by the oracle. The new prices must be the most recent, but no more than 10 minutes into the future.
* `exchangeEtherForSynths() returns (uint)`: Requires that the contract is not paused, and that the prices are not stale. Returns the number of sUSD exchanged. Converts any ether sent to the contract to a quantity of synths at current prices. Fulfils this quantity by iterating through the deposit queue until the entire quantity is found. If a given deposit is insufficient to cover the entire requested amount, it is exhausted and removed from the queue. For each deposit found, the proper quantity of ether is sent to the depositor. If the quantity could not be sent because the target is a non-payable contract, then it is remitted to `fundsWallet`. Then send the Synths to the recipient. If the whole quantity could not be fulfilled, then the remaining ether is refunded to the purchaser.
* `()` (fallback function): Calls `exchangeEtherForSynths`.
* `exchangeEtherForSynthsAtRate(uint guaranteedRate) returns (uint)`: Allows the caller to specify the current price, and then calls to `exchangeEtherForSynths`. Reverts if the current price does not match the price provided as an argument. This is intended as a protection against front-running by the contract owner, or otherwise a case where a price update is in flight at the invocation time.
* `exchangeEtherForSynthetix() returns (uint)`: Requires that the contract is not paused, and that the prices are not stale. Converts the received ether to a quantity of SNX with `synthetixReceivedForEther`. Sends the ether to `fundsWallet`, sends the converted quantity of SNX to the message sender from the contract's own reserves. Returns the SNX quantity sent. If the contract has insufficient SNX, then the transfer will fail and the transaction will revert.
* `exchangeEtherForSynthetixAtRate(uint guaranteedEtherRate, uint guaranteedSynthetixRate) returns (uint)`: As `exchangeEtherForSynthsAtRate` is to `exchangeEtherForSynths`, this is to `exchangeEtherForSynthetix`.
* `exchangeSynthsForSynthetix(uint synthAmount) returns (uint)`: Identical to `exchangeEtherForSynthetix`, but perform the price conversion with `synthetixReceivedForSynths`. The amount of synths to send is provided as a function argument, and then transferred to `fundsWallet` with `transferFrom`, so this function requires the caller to have approved the depot contract to make such a withdrawal. Note that this assumes that sUSD is worth exactly one dollar.
* `exchangeSynthsForSynthetixAtRate(uint synthAmount, uint guaranteedRate) returns (uint)`: As per `exchangeEtherForSynthetixAtRate`.
* `withdrawSynthetix(uint amount)`: Only callable by the contract owner. Allows the owner to transfer SNX out of the Depot to themselves.
* `withdrawMyDepositedSynths()`: Withdraws all Synths deposited by the message sender. Iterates through the entire deposit queue; if for a given entry the message sender is the depositor, delete that deposit and and add the deposited quantity of tokens to the pile to be remitted. Then transfer this quantity back to the message sender, along with any tokens in `smallDeposits`.
* `depositSynths(uint amount)`: Just an alias to `synth.transferFrom(msg.sender, this, amount)`, which relies on the ERC223 token fallback path. This requires the sender to have approved the deposit.
* `tokenFallback(address from, uint amount, bytes data) returns (bool)`: Only callable by the `synth` contract. Handles the actual deposit flow whenever synths are sent to this contract. If the transferred quantity is smaller than the minimum deposit amount, add it to the sender's small deposit balance. Otherwise, "append" the deposit to the deposit queue/mapping and update total sellable deposit quantity.
* `pricesAreStale() returns (bool)`: True if `lastPriceUpdateTime` is more than `priceStalePeriod` seconds in the past.
* `synthetixReceivedForSynths(uint amount) returns (uint)`: Divides `amount` minus the transfer fee by the `usdToSnxPrice`. Assumes that `sUSD` are worth exactly US\$1 each.
* `synthetixReceivedForEther(uint amount) returns (uint)`: Multiplies `amount` by the `usdToEthPrice`, then calls to `synthetixReceivedForSynths` to deduct the transfer fee and to divide by `usdToSnxPrice`. Assumes that `sUSD` are worth exactly US\$1 each.
* `synthsReceivedForEther(uint amount) returns (uint)`: Multiply by `usdToEthPrice` and deduct the transfer fee. Assumes that `sUSD` are worth exactly US\$1 each.

## Events

* `FundsWalletUpdated(address newFundsWallet)`
* `OracleUpdated(address newOracle)`
* `SynthUpdated(ISynth newSynthContract)`
* `SynthetixUpdated(ISynthetix newSynthetixContract)`
* `PriceStalePeriodUpdated(uint priceStalePeriod)`
* `PricesUpdated(uint newEthPrice, uint newSynthetixPrice, uint timeSent)`
* `Exchange(string fromCurrency, uint fromAmount, string toCurrency, uint toAmount)`
* `SynthWithdrawal(address user, uint amount)`
* `SynthDeposit(address indexed user, uint amount, uint indexed depositIndex)`
* `SynthDepositRemoved(address indexed user, uint amount, uint indexed depositIndex)`
* `SynthDepositNotAccepted(address user, uint amount, uint minimum)`
* `MinimumDepositAmountUpdated(uint amount)`
* `NonPayableContract(address indexed receiver, uint amount)`
* `ClearedDeposit(address indexed fromAddress, address indexed toAddress, uint fromETHAmount, uint toAmount, uint indexed depositIndex)`
