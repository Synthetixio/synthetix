"""
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       markets.py
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2017-12-08

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------
An oracle that monitors the ETH/USD price on multiple exchanges,
periodically pushing the median price to a target smart contract.


-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2017 Havven.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
    
-----------------------------------------------------------------
RELEASE NOTES
-----------------------------------------------------------------
- ETH/USD price feeds from a variety of exchanges.


-----------------------------------------------------------------
Block8 Technologies are accelerating blockchain technology
through incubating meaningful, next-generation businesses.
Find out more at block8.io
-----------------------------------------------------------------

"""


import requests
import json
import asyncio

class PriceFeed:
    def __init__(self, name, query_string, access_func):
        self.name = name
        self.query_string = query_string
        self.access_func = access_func

    def query(self):
        return requests.get(self.query_string).text
    
    def price(self):
        return float(self.access_func(json.loads(self.query())))


FEEDS = [PriceFeed("Kraken",
                   "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
                   lambda j: j["result"]["XETHZUSD"]["c"][0]),
         PriceFeed("HitBTC",
                   "https://api.hitbtc.com/api/2/public/ticker/ETHUSD",
                   lambda j: j["last"]),
         PriceFeed("Bitstamp",
                   "https://www.bitstamp.net/api/v2/ticker/ethusd/",
                   lambda j: j["last"]),
         PriceFeed("Gemini",
                   "https://api.gemini.com/v1/pubticker/ethusd",
                   lambda j: j["last"]),
         PriceFeed("Bitfinex",
                   "https://api.bitfinex.com/v2/ticker/tETHUSD",
                   lambda j: j[6]),
         PriceFeed("GDAX",
                   "https://api.gdax.com/products/ETH-USD/ticker",
                   lambda j: j["price"]),
         PriceFeed("Coinbase",
                   "https://api.coinbase.com/v2/prices/ETH-USD/spot",
                   lambda j: j["data"]["amount"]),
         PriceFeed("CEX",
                   "https://cex.io/api/ticker/ETH/USD",
                   lambda j: j["last"]),
         PriceFeed("WEX",
                   "https://wex.nz/api/3/ticker/eth_usd",
                   lambda j: j["eth_usd"]["last"]),
         PriceFeed("Quoine",
                   "https://api.quoine.com/products/27",
                   lambda j: j["last_traded_price"])]

