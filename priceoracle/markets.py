import requests
import json

class PriceFeed:
    def __init__(self,query_string, frequency=feed_frequency):
        self.query_string = query_string
        self.frequency = frequency

    def query(self):
        return requests.get(self.query_string).text


class KrakenFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.kraken.com/0/public/Ticker?pair=ETHUSD")

    def price(self):
        return float(json.loads(self.query())["result"]["XETHZUSD"]["c"][0])

class HitBTCFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.hitbtc.com/api/2/public/ticker/ETHUSD")

    def price(self):
        return float(json.loads(self.query())["last"])

class BitstampFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://www.bitstamp.net/api/v2/ticker/ethusd/")

    def price(self):
        return float(json.loads(self.query())["last"])

class GeminiFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.gemini.com/v1/pubticker/ethusd")

    def price(self):
        return float(json.loads(self.query())["last"])

class BitfinexFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.bitfinex.com/v2/ticker/tETHUSD")

    def price(self):
        return float(json.loads(self.query())[6])

class GDAXFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.gdax.com/products/ETH-USD/ticker")

    def price(self):
        return float(json.loads(self.query())["price"])

class CoinbaseFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.coinbase.com/v2/prices/ETH-USD/spot")

    def price(self):
        return float(json.loads(self.query())["data"]["amount"])

class CEXFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://cex.io/api/ticker/ETH/USD")

    def price(self):
        return float(json.loads(self.query())["last"])

class WEXFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://wex.nz/api/3/ticker/eth_usd")

    def price(self):
        return float(json.loads(self.query())["eth_usd"]["last"])

class QuoineFeed(PriceFeed):
    def __init__(self):
        super().__init__("https://api.quoine.com/products/27")

    def price(self):
        return float(json.loads(self.query())["last_traded_price"])

FEEDS = [KrakenFeed(), HitBTCFeed(), BitstampFeed(),
         GeminiFeed(), BitfinexFeed(), GDAXFeed(),
         CoinbaseFeed(), CEXFeed(), WEXFeed(), QuoineFeed()]
