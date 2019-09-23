# Governance

Ownership of tokens within the Synthetix ecosystem is determined by a public network of Ethereum smart contracts. However the basic protocol design, incentive parameter settings, and system development are presently governed by the Synthetix foundation. Although the foundation initially made this tradeoff between centralisation and speed of development, it is committed to further decentralising key decision-making processes in the system. Steps in this direction are being taken by the development of community-driven governance and development methodologies.

## Synthetix Improvement Proposals (SIPs)

The SIP format describes protocol standards and proposed updates. They provide a central forum for the submission, discussion, and acceptance of rigorous definitions of various components of the core Synthetix system, and documentation of the rationale behind design decisions. SIPs are enumerated at their [official site](https://sips.synthetix.io/).

Historically, SIPs have been used to modify the fee/reward structure, allow the liquidation of unused synths, introduce new synths, and implement various exchange rate front-running protections. They are an appropriate mechanism for a broad range of fundamental alterations to the Synthetix platform and as such require an organised process for community consultation and iteration.

SIPs live in their own [GitHub repository](https://github.com/Synthetixio/SIPs), where the SIP format is [documented](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-1.md) and community members may participate in the acceptance process. Anyone may propose SIPs, though not all SIPs are necessarily accepted.

## Synthetix Configuration Change Proposal (SCCPs)

SCCPs are similar to SIPs, but concern modifications to system configuration values such as exchange fees and the global collateralisation limit.

SCCPs live in the same repository and website as SIPs do, but have a [slightly different specification](https://github.com/Synthetixio/SIPs/blob/master/SCCP/sccp-1.md).

!!! bug
    SIPs (and SCCPs) can be rejected, but the rejected status is not provided in the status enumeration in SIP-1 or SCCP-1.

## Community Governance Calls

Community governance calls are a venue for the Synthetix team to consult with the community. These calls occur on a semi-regular basis and typically have a pre-set agenda of issues to be discussed and resolved. This complements Discord as a central component of the team's commitment to transparency and community engagement on the path to full decentralisation. Upcoming community governance calls are announced on the [Synthetix blog](https://blog.synthetix.io/); [here](https://blog.synthetix.io/summary-community-governance/) are the minutes from the first governance call.

## Development Bounties

The code that runs Synthetix is mostly [MIT licenced](https://github.com/Synthetixio/synthetix/blob/master/LICENSE) and open source, and in principle anyone can contribute. To encourage this, the Synthetix foundation has offered bounties for development and bug reports by parties outside of the core engineering team. Development bounties are managed on [Gitcoin](https://gitcoin.co/profile/Synthetixio) and discussion takes place in corresponding [GitHub issues](https://github.com/Synthetixio/synthetix/issues). Bug bounties are described in [this blog post](https://blog.synthetix.io/synthetix-bug-bounties/).

!!! bug
    The main Synthetix licence is dated 2018. This should be updated.
