# Map

* [ ] [Contracts](contracts.md)
* System Processes
  * [ ] [Governance](governance.md)
  * [ ] Tokens/Synths
  * [ ] Minting
  * [ ] Conversion
  * [ ] Escrow
  * [ ] Connection between collateral pool value and token value
  * [ ] Stabilisation mechanism
  * [ ] Fee pool rewards
  * [ ] Inflationary rewards
  * [ ] Collat ratio targeting
  * [ ] Oracle
  * [ ] The debt ledger
* Integrated Platforms
  * [ ] Uniswap
  * [ ] That graphs thing?
  * [ ] Dapps
  * [ ] Examine bounties
* Assets and Analysis
  * [ ] Classify assets
  * [ ] Risk profiles
  * [ ] Correlation study
* Documents
  * [ ] Litepaper
  * [ ] Readme
  * [ ] [Dev Docs](https://developer.synthetix.io/api/docs/home.html)
  * [ ] [SynthetixJs](https://synthetixjs.synthetix.io/)
  * [ ] [API](https://developer.synthetix.io/api/docs/synthetix)
* Formatting
  * [mkdoc PyMdown extensions](https://facelessuser.github.io/pymdown-extensions/) (especially to fix the maths)

## Areas per email discussions

1. System Characterisation
    1. Detailed and thorough documentation of existing functionality.
    2. Blog post-level summaries of key system components.
2. Technical/Incentive Analysis
    1. Outline of available incentive levers, their consequences and limitations.
    2. Specific areas of particular interest:
        1. Debt holder optimal strategies (e.g. in the present of asset correlation)
        2. Oracle front-running mitigation strategies
        3. Issues with the fee redemption implementation
        4. New incentives to reward those who provide liquidity at the right price rather than dumping into UniSwap
3. Synthetix Position Specification
    1. Formulation of strategies that encourage the book to be neutrally biased.
    2. Characterisation of the maximum exposure of the parties under various conditions.
    3. Identification and attempted resolution of possible exploits.

## Areas of potential vulnerability to investigate

* Oracle front-running.
* C-ratio manipulation.
* Other levers such as marketing, botting?
* Intervention when deployments occur?
* Correlation study of the XDR. What's in this basket?
* Fee period length contradiction between FeePool and FeePoolState
* Do calls to debtBalanceOf outside of totalIssuedSynths allow stale rates?
* Do debt ledger entries lose too much precision given that they are a product of small quantities?
* What happens if I issue very small quantities of synths? Can I lose the debt due to rounding? Thus, can I increase the supply without the system locking any of my snx?
* Can the slashed quantity from the fee pool when rewards are paid out if a person exhausts the pool ever be non-trivial? Comments imply it will just be due to rounding errors, but is this true?

## A Note on Conversion Fee Evasion

The Synthetix system has both a conversion and a transfer fee. Although they should be distinct,
the preferred currency auto conversion on transfer only charges the transfer fee, and not the conversion fee.
As a result, it is possible to convert Synths more cheaply whenever the transfer fee is less than the conversion fee.
Given that the transfer fee is currently 0, it is possible by this means to perform free conversions. First, this potentially
eliminates all fee revenue for the system to incentivise participants with. Second, if markets have priced in the conversion fee
and are unaware of the exploit, then there is a profit cycle here.

In particular:

$$
\text{let } \ \phi_\kappa, \ \phi_\tau \in [0,1] \ \text{ be the conversion and transfer fee rates, respectively.} \\
\pi_A, \ \pi_B \ \text{ be the prices of synths } A \text{ and } B \text{ in terms of some implicit common currency.} \\
Q_A \text{ be a starting quantity of synth A.} \\
$$

Then to convert from $A$ to $B$, quantities

$$
Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\kappa) \\
Q^\tau_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\tau)
$$

are received if the user performs a standard conversion or a transfer conversion, respectively.
The profit of performing a transfer conversion relative to a standard one is then:

$$
Q^\tau_B - Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(\phi_\kappa - \phi_\tau)
$$

That is, the percentage profit is simply $(\phi_\kappa - \phi_\tau)$. With no transfer fee, the profit is $\phi_\kappa$, as expected.

## TODO

* Turn into a web page.
* Extract internal and dev notes into separate document and prepare to make this public-facing.
