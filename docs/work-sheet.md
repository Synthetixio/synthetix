# Work Sheet

??? "Formatting"
    * [mkdoc PyMdown extensions](https://facelessuser.github.io/pymdown-extensions/)
        * [Metadata](https://squidfunk.github.io/mkdocs-material/extensions/metadata/); [Further Notes](https://www.mkdocs.org/user-guide/writing-your-docs/#meta-data)
    * Ask them if they need [google analytics integration](https://squidfunk.github.io/mkdocs-material/getting-started/#google-analytics).
    * Activate inlinehilite
    * Activate [minifier plugin](https://squidfunk.github.io/mkdocs-material/getting-started/#plugins) (don't forget to explicitly activate the search plugin when doing so)
    * All code style comments within the documentation broken out into admonitions instead of inline notes.
    * Reorder the sidebar headings.
    * Finish [Project Configuration](https://www.mkdocs.org/user-guide/configuration/). In particular the [nav layout](https://www.mkdocs.org/user-guide/configuration/#documentation-layout).
    * Look at [this `mkdocs.yml`](https://github.com/squidfunk/mkdocs-material/blob/master/mkdocs.yml) to see if we can do anything similar.
    * Merge into core SNX repository and enable edit buttons. Add a note to the Intro page that the docs can be edited by anyone with a PR. Or perhaps a page on contributing to the docs with a guide and this list of possible things to do.
    * Better colour for details sections
    * Syntax highlighting for Solidity. https://squidfunk.github.io/mkdocs-material/extensions/codehilite/ https://github.com/maurelian/best-practices-docs/blob/master/mkdocs.yml
    * More detailed function signature breakdown including argument descriptions etc.
    * Expand all/Collapse all button for details panels.
    * See if ambiguous anchor links such as those in DelegateApprovals and SelfDestructible can be disambiguated.
    * Inheritance graph, contract interaction diagram, and libraries in tabbed details panel. https://github.com/squidfunk/mkdocs-material/issues/955
    * Run aspell over everything.

??? "System Processes"
    * Synths and exchange
    * Issuance
    * Escrow contracts
    * Connection between collateral pool value and token value
    * Stabilisation mechanism
    * The fee pool, and fees vs inflationary rewards
    * Collat ratio targeting, and Collateralisation vs Issuance Ratios
    * Oracle
    * The debt ledger: examine what occurs if relative movements in price/supply occur between currencies
    * System value flow
    * Smart contract architecture
    * [Contract publication](https://github.com/Synthetixio/synthetix/tree/master/publish)
    * [Contract verification](https://github.com/Synthetixio/synthetix/blob/master/verifyContracts.md) (This probably needs to be deleted)
    * Uniswap section

??? "Existing Documents"
    * [Litepaper](https://www.synthetix.io/uploads/synthetix_litepaper.pdf)
    * [Dev Docs](https://developer.synthetix.io/api/docs/home.html)
    * [SynthetixJs](https://synthetixjs.synthetix.io/)
    * [API](https://developer.synthetix.io/api/docs/synthetix)
    * Make sure the block analysis points are addressed: see the [original article](https://www.theblockcrypto.com/2019/06/12/synthetix-synthetic-asset-issuance-protocol/), and [its response](https://blog.synthetix.io/response-to-the-block-analysis/).
    * Examine the [token tuesdays post on Synthetix](https://tokentuesdays.substack.com/p/synthetix).

??? "Potential Vulnerabilities To Investigate"
    * Oracle front-running.
    * Issuance ratio non-specificity. It adjusts the aggregated ratio, but Synths could depeg independently. This particularly affects flavours with relatively smaller market caps.
    * C-ratio manipulation.
    * Other levers such as marketing, botting?
    * Intervention when deployments occur?
    * Correlation study of the XDR. What's in this basket?
    * Fee period length contradiction between FeePool and FeePoolState
    * Do calls to debtBalanceOf outside of totalIssuedSynths allow stale rates?
    * Do debt ledger entries lose too much precision given that they are a product of small quantities?
    * What happens if I issue very small quantities of synths? Can I lose the debt due to rounding? Thus, can I increase the supply without the system locking any of my snx?
    * Can the slashed quantity from the fee pool when rewards are paid out if a person exhausts the pool ever be non-trivial? Comments imply it will just be due to rounding errors, but is this true?
    * Can a user derive more fees by simply waiting until they withdrew before the recently tracked fee periods? 

??? "Assets and Analysis"
    * Classify assets
    * Risk profiles
    * Correlation study

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
