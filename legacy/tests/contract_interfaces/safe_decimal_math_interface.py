
class SafeDecimalMathInterface:
    def __init__(self, contract, name):
        self.contract = contract
        self.contract_name = name

        self.decimals = lambda: self.contract.functions.decimals().call()
        self.UNIT = lambda: self.contract.functions.UNIT().call()

        self.addIsSafe = lambda x, y: self.contract.functions.pubAddIsSafe(x, y).call()
        self.safeAdd = lambda x, y: self.contract.functions.pubSafeAdd(x, y).call()
        self.subIsSafe = lambda x, y: self.contract.functions.pubSubIsSafe(x, y).call()
        self.safeSub = lambda x, y: self.contract.functions.pubSafeSub(x, y).call()
        self.mulIsSafe = lambda x, y: self.contract.functions.pubMulIsSafe(x, y).call()
        self.safeMul = lambda x, y: self.contract.functions.pubSafeMul(x, y).call()
        self.multiplyDecimal = lambda x, y: self.contract.functions.pubSafeMul_dec(x, y).call()
        self.divIsSafe = lambda x, y: self.contract.functions.pubDivIsSafe(x, y).call()
        self.safeDiv = lambda x, y: self.contract.functions.pubSafeDiv(x, y).call()
        self.divideDecimal = lambda x, y: self.contract.functions.pubSafeDiv_dec(x, y).call()
        self.intToDec = lambda i: self.contract.functions.pubIntToDec(i).call()
