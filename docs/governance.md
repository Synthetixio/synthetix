# Governance

Ownership of tokens within the Synthetix ecosystem is determined by a trustless network of Ethereum smart contracts. However the basic protocol design, incentive parameter settings, and system development are governed by the Synthetix foundation. the foundation is committed to further decentralising these processes. Steps in this direction are being taken by the development of community-driven governance and development standards.

## Synthetix Improvement Proposals (SIPs)

The SIP format describes protocol standards and proposed updates. They provide a central forum for the submission, discussion, and acceptance of rigorous definitions of various components of the core Synthetix system, and documentation of the rationale behind design decisions.

Historically, SIPs have been used to modify the fee/reward structure, allow the liquidation of unused synths, introduce new synths, and implement various exchange rate front-running protections.

SIPs live at [SIPs GitHub repository](https://github.com/Synthetixio/SIPs), where the format is documented and community members may participate in the process. SIPs are also enumerated at the [official SIP site](https://sips.synthetix.io/).

!!! TODO
    Take these SIPs and incorporate the rationale into the notes for the contracts they affect. Make sure to review the original SIP.

* SIP-1: SIP specification.
* SIP-2: Eliminates fee penalty tiers and replaces them with a flat 100% penalty if above a target ratio.
* SIP-3: Purgeable Synths -- Allow the ability to destroy synths, refunding the balances in sUSD to holders. This allows removing unused synths, which otherwise cause unnecessary gas costs.
* SIP-4: Reduces fee window from 6 weeks to 2 in order to increase the responsiveness of incentive changes. It requires fees to roll over through the entire fee window before incentive changes are actually felt.
* SIP-5: Add six new synths sTRX, iTRX, sXTZ, iXTZ, sMKR, iMKR. Crypto synths and their inverses.
* SIP-6: Front-running protection: the oracle monitors activity for front-running. If it detects this, then the exchange fee rate is jacked up to 99% so that the front-runner's transaction is sucked up. Additionally, a user will be able to specify a fee rate above which their transaction will fail so that they don't get caught by the front running protection. Note: doesn't this protect the front-runners as well? UPDATED: the setProtectionCircuit function allows the oracle to target only particular transactions to be rejected.
* SIP-7: More front-running protection: exchange pausing; preventing changes while oracle updates are in progress; remove the destination param in an exchange so that they only go to the message sender.
* SIP-8: Allow SNX inflationary rewards to be granted to people offering liquidity to the UniSwap pool, pro-rata with the share of tokens in the pool.

## Synthetix Configuration Change Proposal (SCCPs)

SCCPs are similar to SIPs, but concern modifications to the values of system configuration values such as exchange fees and the global collateralisation limits.

SCCPs live in the [same repository](https://github.com/Synthetixio/SIPs/tree/master/SCCP) and [website](https://sips.synthetix.io/) as SIPs are.

* SCCP-1: SCCP specification.
* SCCP-2: C-ratio to 750%
* SCCP-3: Exchange fee to 50bp from 30bp for two weeks to observe the impact on front-running.

## Development Bounties

The Synthetix foundation has offered bounties for development and bug reports. Development bounties are managed on [Gitcoin](https://gitcoin.co/profile/Synthetixio) and discussion of these bounties is available in corresponding [GitHub issues](https://github.com/Synthetixio/synthetix/issues). Bug bounties are described in [this blog post](https://blog.synthetix.io/synthetix-bug-bounties/).
