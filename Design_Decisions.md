# Design Decisions

## FeePoolState

FeePoolState was required to store each accounts issuance data per fee period. Seperating the store of per account debt ratio data from the upgradable FeePool logic contract.
FeePoolState is not deisnged to be upgraded. If an upgrade is required, all issuerdata must be collected from the event logs and reconstructed and imported into a new instance of the contract.
Upgrade requirements might include;

- change in the IssuanceData struct
- change in the length of fee periods FEE_PERIOD_LENGTH
