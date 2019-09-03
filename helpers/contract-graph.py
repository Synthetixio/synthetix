from typing import List, Dict, Tuple
import pickle
import json
import csv
import requests
from web3 import Web3, HTTPProvider
import networkx as nx

INITIALISATION_FILE = 'addresses.csv'
PICKLE_FILE = 'addresses.pkl'
JSON_FILE = 'addresses.json'
ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'


class Address:
    def __init__(self, address: str):
        self.name: str = ''
        self.contract: str = ''
        self.address: str = address
        self.is_contract: bool = False
        self.is_verified: bool = False
        self.functions: List[str] = []
        self.functions_to_addresses: Dict[str, str] = {}  # Function name -> the address(es) that function returns
        self.abi: List[object] = []

    def __str__(self) -> str:
        return f'{self.address} || ' + str(self.functions_to_addresses)

    def __repr__(self) -> str:
        return str(self)

    @staticmethod
    def is_address_func(f):
        return f['type'] == 'function' and \
               len(f['inputs']) == 0 and \
               len(f['outputs']) == 1 and \
               f['outputs'][0]['type'] == 'address'

    @staticmethod
    def address_funcs_from_abi(abi) -> List[str]:
        return [f['name'] for f in abi if Address.is_address_func(f)]

    def setup(self, w3):
        print(f'Fetching contract code for address {self.address}.')
        if self.name != '':
            print(f'Associated address name is {self.name}.')
        if self.contract != '':
            print(f'Associated address contract is {self.contract}.')

        # Determine if this address is a contract
        code = w3.eth.getCode(self.address)
        self.is_contract = len(code) != 0
        print(f'{len(code)} bytes retrieved.')

        if not self.is_contract:
            print(f'Address is not a contract.')
            return

        # Now extract the functions that return addresses
        print('Fetching source code from etherscan.')
        abi_response = requests.get(
            f"https://api.etherscan.io/api?module=contract&action=getabi&address={self.address}").json()
        self.is_verified = abi_response['status'] == '1'
        print(f'Contract verified? {self.is_verified}.')
        contract = None
        if self.is_verified:
            print('Extracting contract abi and address functions.')
            self.abi = json.loads(abi_response['result'])
            contract = w3.eth.contract(address=self.address, abi=self.abi)
            self.functions = Address.address_funcs_from_abi(self.abi)

        # Query the functions themselves to grab the addresses
        print("Querying 0-arity functions yielding addresses.")
        for f in self.functions:
            address = contract.functions[f]().call()
            addresses = []

            if type(address) != list:
                addresses = [address]
            else:
                addresses = address

            addresses = [a for a in addresses if a != ZERO_ADDRESS]
            for a in addresses:
                self.functions_to_addresses[f] = address
                print(f'{f} -> {address}')


def save_addresses(addresses: Dict[str, Address], filename: str = PICKLE_FILE):
    print(f'Saving addresses to file {filename}.')
    with open(filename, 'wb') as f:
        pickle.dump(addresses, f)


def load_addresses(filename: str = PICKLE_FILE):
    print(f'Loading addresses from file {filename}.')
    with open(filename, 'rb') as f:
        return pickle.load(f)


def load_initial_address(filename: str = INITIALISATION_FILE) -> Dict[str, Tuple[str, str]]:
    with open(filename, 'r') as f:
        addresses = {}
        r = csv.reader(f)
        for row in r:
            addresses[row[2]] = (row[0], row[1])
        return addresses


def fetch_contracts():
    w3 = Web3(HTTPProvider('https://mainnet.infura.io/v3/41aa0126bf9e4f9a9d7c0b36707d5922'))

    initial = load_initial_address()
    queue = {a for a in initial}

    addresses: Dict[str, Address] = {}

    while len(queue) != 0:
        eth_address = queue.pop()

        if eth_address not in addresses:
            address = Address(eth_address)
            if eth_address in initial:
                address.name = initial[eth_address][0]
                address.contract = initial[eth_address][1]

            address.setup(w3)
            addresses[eth_address] = address

            for other in address.functions_to_addresses.values():
                if other not in queue and other not in addresses:
                    queue.add(other)
        print()

    print(f'Extracted {len(addresses)} addresses. Saving')
    save_addresses(addresses)


def draw_graph(edge_labels: bool = False, only_contracts: bool = False):
    # We are still including LegacyDepotFeePool because the Depot uses it
    excluded = [
        'LegacySynthSynthetix',
        'LegacyDepotSynthetix',
        'LegacyDepotFeePool',
        'LegacyDepotExchangeRate',
        'LegacyGBPExchangeRates'
    ]

    included_synths = ['USD']

    addresses: Dict[str, Address] = load_addresses()
    name_if_exists = lambda adds, a: adds[a].name if adds[a].name != '' else a
    G = nx.DiGraph()

    for a in addresses:
        func_items = addresses[a].functions_to_addresses.items()
        for f, o in func_items:
            if f == 'owner' or f == 'selfDestructBeneficiary':
                continue

            this_name = name_if_exists(addresses, a)
            other_name = name_if_exists(addresses, o)

            # Eliminate legacy synthetix contracts
            if this_name in excluded or other_name in excluded:
                continue

            if ('Synth' in this_name and 'Synthetix' not in this_name) or \
                    ('Synth' in other_name and 'Synthetix' not in other_name):
                if not any([s in this_name + other_name for s in included_synths]):
                    continue

            if edge_labels:
                G.add_edge(this_name, other_name, label=f)
            else:
                G.add_edge(this_name, other_name)

    # Draw non-contracts as boxes.
    for a in addresses:
        name = name_if_exists(addresses, a)
        if name not in G.nodes:
            continue
        if not addresses[a].is_contract:
            if only_contracts:
                G.remove_node(name)
            else:
                G.nodes[name]['shape'] = 'box'

    print('Drawing graph.')
    nx.drawing.nx_agraph.write_dot(G, 'testgraph.dot')


def to_objects():
    addresses: Dict[str, Address] = load_addresses()
    address_list = []

    for _, address in addresses.items():
        entry = {
            'name': address.name,
            'address': address.address,
            'contract': address.contract,
            'is_contract': address.is_contract,
            'is_verified': address.is_verified,
            'neighbours': address.functions_to_addresses}

        address_list.append(entry)

    return address_list


def dump_json():
    objs = to_objects()
    with open(JSON_FILE, 'w') as f:
        json.dump(objs, f)


def main():
    # fetch_contracts()
    draw_graph()
    # dump_json()


if __name__ == '__main__':
    main()
