# Map

??? "TODO"
    * Extract internal and dev notes into separate document and prepare to make this public-facing.

## Areas of Interest

??? "System Processes"
    * [ ] [Contracts](contracts/index.md)
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
??? "Integrated Platforms"
    * [ ] Uniswap
    * [ ] That graphs thing?
    * [ ] Dapps
    * [ ] Examine bounties
??? "Assets and Analysis"
    * [ ] Classify assets
    * [ ] Risk profiles
    * [ ] Correlation study
??? "Documents"
    * [ ] Litepaper
    * [ ] Readme
    * [ ] [Dev Docs](https://developer.synthetix.io/api/docs/home.html)
    * [ ] [SynthetixJs](https://synthetixjs.synthetix.io/)
    * [ ] [API](https://developer.synthetix.io/api/docs/synthetix)
??? "Formatting"
    * [mkdoc PyMdown extensions](https://facelessuser.github.io/pymdown-extensions/) (especially to fix the maths)
    * Diagrams
    * Fix maths
??? "Potential Vulnerabilities To Investigate"
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

## Areas as per Email Discussions

??? "System Characterisation"
    1. Detailed and thorough documentation of existing functionality.
    2. Blog post-level summaries of key system components.

??? "Technical Incentive Analysis"
    1. Outline of available incentive levers, their consequences and limitations.
    2. Specific areas of particular interest:
        1. Debt holder optimal strategies (e.g. in the present of asset correlation)
        2. Oracle front-running mitigation strategies
        3. Issues with the fee redemption implementation
        4. New incentives to reward those who provide liquidity at the right price rather than dumping into UniSwap

??? "Synthetix Position Specification"
    1. Formulation of strategies that encourage the book to be neutrally biased.
    2. Characterisation of the maximum exposure of the parties under various conditions.
    3. Identification and attempted resolution of possible exploits.
