"""
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       oracle.py
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
- Initial scaffolding of tokensale contract. Interfaces to other
contracts holding core Havven (alpha version) functionality.


-----------------------------------------------------------------
Block8 Technologies are accelerating blockchain technology
through incubating meaningful, next-generation businesses.
Find out more at block8.io
-----------------------------------------------------------------

"""

from concurrent.futures import ThreadPoolExecutor
from markets import FEEDS, PriceFeed

class PriceList:
    def __init__(self):
        self.prices = {feed.name: 0 for feed in FEEDS}
        if len(self.prices) == 0:
            raise ValueError("FATAL: Price feed list is empty!")
        self.last_median = None

    def update_price(self, feed):
        try:
            self.prices[feed.name] = feed.price()
            print(f"Updated {feed.name} to {self.prices[feed.name]}.")
            return self.prices[feed.name]
        except:
            self.prices[feed.name] = None
            return None

    def median_price(self):
        print(self.prices)
        s_prices = sorted([v for v in self.prices.values() if v is not None])
        p_len = len(s_prices)
        
        if p_len != 0:
            # Update the current median price if any prices were reported.
            mid = p_len // 2
            if p_len % 2:
                self.last_median = s_prices[mid]
            else:
                self.last_median = (s_prices[mid] + s_prices[mid - 1]) / 2

        return self.last_median

plist = PriceList()
with ThreadPoolExecutor() as executor:
    futures = executor.map(plist.update_price, FEEDS, timeout=10)
    print(list(futures))

print(plist.median_price())
