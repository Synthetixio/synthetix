# Run Sheet

??? "TODO"
    * Complete TODOs in [`contracts/index.md`](contracts/index.md).
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
    * [ ] System value flow
    * [ ] Smart contract architecture
    * [ ] [Contract publication](https://github.com/Synthetixio/synthetix/tree/master/publish)
    * [ ] [Contract verification](https://github.com/Synthetixio/synthetix/blob/master/verifyContracts.md) (This probably needs to be deleted)

??? "Integrated Platforms"
    * [ ] Uniswap
    * [ ] Dapps
    * [ ] Examine bounties

??? "Assets and Analysis"
    * [ ] Classify assets
    * [ ] Risk profiles
    * [ ] Correlation study

??? "Documents"
    * [ ] [Litepaper](https://www.synthetix.io/uploads/synthetix_litepaper.pdf)
    * [ ] [Dev Docs](https://developer.synthetix.io/api/docs/home.html)
    * [ ] [SynthetixJs](https://synthetixjs.synthetix.io/)
    * [ ] [API](https://developer.synthetix.io/api/docs/synthetix)
    * [ ] Make sure the block analysis points are addressed: see the [original article](https://www.theblockcrypto.com/2019/06/12/synthetix-synthetic-asset-issuance-protocol/), and [its response](https://blog.synthetix.io/response-to-the-block-analysis/).

??? "Formatting"
    * [ ] [mkdoc PyMdown extensions](https://facelessuser.github.io/pymdown-extensions/)
        * [ ] [MagicLink](https://facelessuser.github.io/pymdown-extensions/extensions/magiclink/), and integrate it with the source repo.
        * [ ] [Metadata](https://squidfunk.github.io/mkdocs-material/extensions/metadata/); [Further Notes](https://www.mkdocs.org/user-guide/writing-your-docs/#meta-data)
    * [ ] Diagrams
    * [ ] [Split contracts and high level descriptions into top level tabs](https://squidfunk.github.io/mkdocs-material/getting-started/#tabs)
    * [ ] Ask them if they need [google analytics integration](https://squidfunk.github.io/mkdocs-material/getting-started/#google-analytics).
    * [ ] Activate inlinehilite
    * [ ] Activate [minifier plugin](https://squidfunk.github.io/mkdocs-material/getting-started/#plugins) (don't forget to explicitly activate the search plugin when doing so)
    * [ ] See if there's a way to reorder the sidebar headings.
    * [ ] All code style comments within the documentation broken out into admonitions instead of inline notes.
    * [ ] Finish [Project Configuration](https://www.mkdocs.org/user-guide/configuration/). In particular the [nav layout](https://www.mkdocs.org/user-guide/configuration/#documentation-layout).
    * [ ] Look at [this `mkdocs.yml`](https://github.com/squidfunk/mkdocs-material/blob/master/mkdocs.yml) to see if we can do anything similar.
    * [ ] Add a "key links" section to all pages which need it.

??? "Potential Vulnerabilities To Investigate"
    * [ ] Oracle front-running.
    * [ ] C-ratio manipulation.
    * [ ] Other levers such as marketing, botting?
    * [ ] Intervention when deployments occur?
    * [ ] Correlation study of the XDR. What's in this basket?
    * [ ] Fee period length contradiction between FeePool and FeePoolState
    * [ ] Do calls to debtBalanceOf outside of totalIssuedSynths allow stale rates?
    * [ ] Do debt ledger entries lose too much precision given that they are a product of small quantities?
    * [ ] What happens if I issue very small quantities of synths? Can I lose the debt due to rounding? Thus, can I increase the supply without the system locking any of my snx?
    * [ ] Can the slashed quantity from the fee pool when rewards are paid out if a person exhausts the pool ever be non-trivial? Comments imply it will just be due to rounding errors, but is this true?

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
