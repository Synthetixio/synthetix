# System Overview

## Purpose

## Economics

## Technologies

## Smart Contract Architecture

## From old repo

Traditionally gold was used as a reserve store of value by various governments around the world to prove that there was value to back their currency. The Synthetix system replicates this setup, but completely on-chain, and with multiple flavours of stablecoin (Synths), and a store of value backing them up (SNX - Synthetix Network Token).

As users transact in the system, small fees are remitted, which get sent to SNX holders that enable the economy to exist. Multicurrency is the latest piece of work on the system.

Users are able to withdraw their fees in any nomin currency that we support. Users are entitled to fees once they've issued synths (to help create the economy generating the fees) and waited for a complete fee period to elapse (currently 7 days). Issuers are incentivised to maintain the ratio of collateral (SNX) to Synths such that the Synths in circulation are generally only worth 20% of the value of the Synthetix Network Tokens backing them up via a penalty for being over 20% collateralised. This allows pretty severe price shocks to SNX without threatening the value of the Synths.

We have also invented a nomin currency called XDRs (Synthetix Drawing Rights, loosely modeled on SDRs from the UN). Its exchange rate is derived by looking at a basket aggregate of currencies to avoid biasing towards any particular fiat currency. Fees are stored in this currency, and users can hold these Synths if they want to lessen the impact on their holdings from a particular fiat currency changing in value.

Now that we have an exchange() mechanism that allows users to switch between Synth currencies, it made sense to move the fee logic out the Synth token into its own standalone contract. This allows us to have more complex fee collection logic as well.

Also it's worth noting that there's a decimal library being used for "floating point" math with 10^18 as the base. Also many of the contracts are provided behind a proxy contract for easy upgradability.

We have also implemented what I'm going to call almost-ERC223 since the last audit. This allows you as a contract to implement a tokenFallback function which gets called by our contracts whenever transfers or exchanges happen. Unlike ERC223, it is not a requirement that contracts implement this function, as we're already listed on a number of DEXes that do not implement this functionality, and we need to preserve full backwards compatibility for them. Users can also pass a bytes[] memo when they transfer, but we implement the standard ERC20 transfer event, again for backwards compatibility with tooling such as Etherscan.
