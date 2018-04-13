from utils.deployutils import mine_tx


class LimitedSetupInterface:
    def __init__(self, contract):
        self.contract = contract

        # Limited setup is all private...
