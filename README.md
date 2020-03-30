# Synthetix (on the OVM)

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
[![npm version](https://badge.fury.io/js/synthetix.svg)](https://badge.fury.io/js/synthetix)
[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/)
[![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

Synthetix is a crypto-backed synthetic asset platform.

It is a multitoken system, powered by SNX, the Synthetix Network Token. SNX holders can stake SNX to issue Synths, on-chain synthetic assets via the [Mintr Dapp](https://mintr.synthetix.io) The network currently supports an ever growing [list of synthetic assets](https://www.synthetix.io/tokens/). Please see the [list of the deployed contracts on MAIN and TESTNETS](https://developer.synthetix.io/api/docs/deployed-contracts.html)
Synths can be traded using (https://synthetix.exchange)

Synthetix uses a proxy system so that upgrades will not be disruptive to the functionality of the contract. This smooths user interaction, since new functionality will become available without any interruption in their experience. It is also transparent to the community at large, since each upgrade is accompanied by events announcing those upgrades. New releases are managed via the [Synthetix Improvement Proposal (SIP)](https://sips.synthetix.io/all-sip) system similar to the [EF's EIPs](https://eips.ethereum.org/all)

Prices are commited on chain by a trusted oracle. Moving to a decentralised oracle is phased in with the first phase completed for all forex prices using Chainlink. (https://landing-feeds.surge.sh).

Please note that this repository is under development.

The code here will be under continual audit and improvement as the project progresses.

# The OVM
This is a fork of the Synthetix codebase, which has been altered for compatability with the Optimistic Virtual Machine (OVM). Contracts that can be run in the OVM can be run on Optimistic Rollup, providing 10-100x cheaper transaction fees and instant confirmations.
