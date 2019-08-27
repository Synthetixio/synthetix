# Governance

## SIPs (Synthetix Improvement Proposals)

TODO: Examine the new SIP website.

* SIP-1: SIP specification.
* SIP-2: Eliminates fee penalty tiers and replaces them with a flat 100% penalty if above a target ratio.
* SIP-3: Purgeable Synths -- Allow the ability to destroy synths, refunding the balances in sUSD to holders. This allows removing unused synths, which otherwise cause unnecessary gas costs.
* SIP-4: Reduces fee window from 6 weeks to 2 in order to increase the responsiveness of incentive changes. It requires fees to roll over through the entire fee window before incentive changes are actually felt.
* SIP-5: Add six new synths sTRX, iTRX, sXTZ, iXTZ, sMKR, iMKR. Crypto synths and their inverses.
* SIP-6: Front-running protection: the oracle monitors activity for front-running. If it detects this, then the exchange fee rate is jacked up to 99% so that the front-runner's transaction is sucked up. Additionally, a user will be able to specify a fee rate above which their transaction will fail so that they don't get caught by the front running protection. Note: doesn't this protect the front-runners as well? UPDATED: the setProtectionCircuit function allows hte oracle to target only particular transactions to be rejected.
* SIP-7: More front-running protection: exchange pausing; preventing changes while oracle updates are in progress; remove the destination param in an exchange so that they only go to the message sender.
* SIP-8: Allow SNX inflationary rewards to be granted to people offering liquidity to the UniSwap pool, pro-rata with the share of tokens in the pool.

## SCCPs (Synthetix Configuration Change Proposal)

* SCCP-1: SCCP specification.
* SCCP-2: C-ratio to 750%
* SCCP-3: Exchange fee to 50bp from 30bp for two weeks to observe the impact on front-running.
