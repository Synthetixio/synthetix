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
import time


PRICE_REFRESH_TIME = 5
'Refresh the price every x seconds'

PRICE_DISPLAY_TIME = 80
'Display the price every x seconds'

VOLUME_WEIGHTED = True
'Weigh price results based on volume'

FORCE_PRICE_UPDATE_SHOCK = .01
'''
How much % of a shock needs to happen since the last displayed price
to force the next price to be shown immediately
'''

BLOCK_TIME = 20
'''
The minimum time between price displays during periods of large shocks
This should be close to ether block time, in the future, this can be faster
as long as previous updates can be changed before they go to the blockchain
'''

PRICE_REFRESH_TIMEOUT = 2
'How long should each individual price feed wait for a response'

SIMPLE_MOVING_AVERAGE_STEPS = 5
'Price is a simple moving average that takes x steps into consideration'


class PriceList:
    def __init__(self):
        self.prices = {feed.name: 0 for feed in FEEDS}
        if len(self.prices) == 0:
            raise ValueError("FATAL: Price feed list is empty!")
        self.last_median = None
        self.last_update_time = 0
        self.last_displayed_price = 0
        self.last_display_time = 0
        self.historical_prices = []

    def update_single_price(self, feed):
        try:
            self.prices[feed.name] = feed.price(VOLUME_WEIGHTED)
            # print(f"Updated {feed.name} to {self.prices[feed.name]}.")
            return self.prices[feed.name]
        except:
            self.prices[feed.name] = None
            return None

    def update_prices(self):
        with ThreadPoolExecutor() as executor:
            executor.map(self.update_single_price, FEEDS, timeout=PRICE_REFRESH_TIMEOUT)

        self.historical_prices.append(self.median_price())
        if len(self.historical_prices) > SIMPLE_MOVING_AVERAGE_STEPS:
            self.historical_prices.pop(0)

    def run(self):
        while True:
            start_time = time.time()
            self.update_prices()

            # if no prices, try again TODO: count failures, do something when it fails too much?
            if len(self.historical_prices) < 1:
                continue

            price = sum(self.historical_prices) / len(self.historical_prices)
            print(f"price history now: {self.historical_prices}")
            # if its time to present a new price
            if time.time() - self.last_display_time >= PRICE_DISPLAY_TIME:
                self.send_price(price)
            elif abs((self.last_displayed_price-price)/self.last_displayed_price) > FORCE_PRICE_UPDATE_SHOCK:
                print(f"PRICE SHOCK! {(self.last_displayed_price-price)/self.last_displayed_price}%")
                self.send_price(price)

            # Wait for PRICE_REFRESH_TIME
            price_update_duration = time.time() - start_time
            if price_update_duration < PRICE_REFRESH_TIME:
                time.sleep(PRICE_REFRESH_TIME - price_update_duration)

    def send_price(self, value):
        if time.time() - self.last_displayed_price > BLOCK_TIME:
            print(f"Send to smart contract: {value}")
            self.last_display_time = time.time()
            self.last_displayed_price = value

    def median_price(self):
        """
        Get the volume weighted median price
        if VOLUME_WEIGHTED is false, all volumes will be 1,
        if volume is missing, volume will also be 1.
        """

        s_prices = sorted([v for v in self.prices.values() if v is not None])
        total_weight = sum([i[1] for i in s_prices])
        current_weight = 0
        for n, i in enumerate(s_prices):
            current_weight += i[1]
            if current_weight > total_weight/2:
                self.last_median = i[0]
                break
            elif current_weight == total_weight/2:
                # should be safe to assume n+1 exists in this case, as weights should be at least 1
                # i.e. one element exists, its weight would be 1 > 0.5(total/2)
                self.last_median = (i[0] + s_prices[n+1][0])/2
                break
        return self.last_median


if __name__ == '__main__':
    plist = PriceList()
    while True:
        # NEVER DIE
        try:
            plist.run()
        except KeyboardInterrupt:
            break
        except Exception:
            continue
    pass

