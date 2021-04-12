pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BinaryOption.sol";
import "./BinaryOptionMarket.sol";
import "./BinaryOptionMarketManager.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarketdata
contract BinaryOptionMarketData {
    struct OptionValues {
        uint long;
        uint short;
    }

    struct Deposits {
        uint deposited;
        uint exercisableDeposits;
    }

    struct Resolution {
        bool resolved;
        bool canResolve;
    }

    struct OraclePriceAndTimestamp {
        uint price;
        uint updatedAt;
    }

    // used for things that don't change over the lifetime of the contract
    struct MarketParameters {
        address creator;
        BinaryOptionMarket.Options options;
        BinaryOptionMarket.Times times;
        BinaryOptionMarket.OracleDetails oracleDetails;
        BinaryOptionMarketManager.Fees fees;
        BinaryOptionMarketManager.CreatorLimits creatorLimits;
    }

    struct MarketData {
        OraclePriceAndTimestamp oraclePriceAndTimestamp;
        BinaryOptionMarket.Prices prices;
        Deposits deposits;
        Resolution resolution;
        BinaryOptionMarket.Phase phase;
        BinaryOptionMarket.Side result;
        OptionValues totalBids;
        OptionValues totalClaimableSupplies;
        OptionValues totalSupplies;
    }

    struct AccountData {
        OptionValues bids;
        OptionValues claimable;
        OptionValues balances;
    }

    function getMarketParameters(BinaryOptionMarket market) public view returns (MarketParameters memory) {
        (BinaryOption long, BinaryOption short) = market.options();
        (uint biddingEndDate, uint maturityDate, uint expiryDate) = market.times();
        (bytes32 key, uint strikePrice, uint finalPrice) = market.oracleDetails();
        (uint poolFee, uint creatorFee, uint refundFee) = market.fees();

        MarketParameters memory data =
            MarketParameters(
                market.creator(),
                BinaryOptionMarket.Options(long, short),
                BinaryOptionMarket.Times(biddingEndDate, maturityDate, expiryDate),
                BinaryOptionMarket.OracleDetails(key, strikePrice, finalPrice),
                BinaryOptionMarketManager.Fees(poolFee, creatorFee, refundFee),
                BinaryOptionMarketManager.CreatorLimits(0, 0)
            );

        // Stack too deep otherwise.
        (uint capitalRequirement, uint skewLimit) = market.creatorLimits();
        data.creatorLimits = BinaryOptionMarketManager.CreatorLimits(capitalRequirement, skewLimit);
        return data;
    }

    function getMarketData(BinaryOptionMarket market) public view returns (MarketData memory) {
        (uint price, uint updatedAt) = market.oraclePriceAndTimestamp();
        (uint longClaimable, uint shortClaimable) = market.totalClaimableSupplies();
        (uint longSupply, uint shortSupply) = market.totalSupplies();
        (uint longBids, uint shortBids) = market.totalBids();
        (uint longPrice, uint shortPrice) = market.prices();

        return
            MarketData(
                OraclePriceAndTimestamp(price, updatedAt),
                BinaryOptionMarket.Prices(longPrice, shortPrice),
                Deposits(market.deposited(), market.exercisableDeposits()),
                Resolution(market.resolved(), market.canResolve()),
                market.phase(),
                market.result(),
                OptionValues(longBids, shortBids),
                OptionValues(longClaimable, shortClaimable),
                OptionValues(longSupply, shortSupply)
            );
    }

    function getAccountMarketData(BinaryOptionMarket market, address account) public view returns (AccountData memory) {
        (uint longBid, uint shortBid) = market.bidsOf(account);
        (uint longClaimable, uint shortClaimable) = market.claimableBalancesOf(account);
        (uint longBalance, uint shortBalance) = market.balancesOf(account);

        return
            AccountData(
                OptionValues(longBid, shortBid),
                OptionValues(longClaimable, shortClaimable),
                OptionValues(longBalance, shortBalance)
            );
    }
}
