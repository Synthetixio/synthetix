from utils.deployutils import mine_tx


class LimitedSetupInterface:
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        # Limited setup is all private...
