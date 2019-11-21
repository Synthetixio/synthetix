## Tests to cover

### 3 accounts with 33.33 SNX

- [x] all issueMAX sUSD, claim in p1, all get 33.33 of rewards
- [x] all issueMAX sUSD, all claim in p6, all get 33.33 of rewards
- [x] all issueMAX sUSD, Acc1 claims in p1 and then leaves, then Acc2&3 claim 33% of p1 & 50% of p2
- [-] p1: Acc1 & 2 mints 10K in BTC which increases 50% then Acc3 mints 10K sUSD and now Acc3 has 20% of the debt/rewards

- [ ] ctd now in p3 Acc1 burns all and leaves (-40%) and Acc2 has 67% and Acc3 33% rewards allocated as such
- [ ] p3: Acc1 mints 20K (40%) close p (40,40,20)

- [ ] (Inverse) Issue sBTC then shift rate down 50% then calc rewards

### accounts not claiming

- [ ] Acc 1 doesnt claim and rewards roll over
- [ ] Acc2 & 3 should get the extra amount
- [ ] Acc1 doesn't claim and leaves p0, 2 & 3 should get the extra amount at period close

### 3 accounts issue 10K suSD each in p1

- [-] p2 Acc1 Issues 20K sUSD now has 50% debt/rewards Acc2&3 25%
- [-] p3 Acc1 Burns all then mints 10K then mint 10K debt/rewards 50%
- [ ] duplicate previous tests but wait till end of 6 weeks claimable is the same

### Ratio Penalties

- [x] penalty of 25% when users claim rewards between 22%-30% collateralisation ratio
- [x] penalty of 50% when users claim rewards between 30%-40% collateralisation ratio
- [x] penalty of 75% when users claim rewards between 40%-50% collateralisation ratio
- [x] penalty of 90% when users claim rewards between > 50% collateralisation ratio
- [x] penalty of 100% when users claim rewards between > 100% collateralisation ratio

### 3 way issuance game

- owner to allocate 3 accounts with 33333333.333333333333333333 SNX
- set FeePool.feePeriodDuration to 60 seconds
- 3 accounts issueMax sUSD 0x73555344 in p0

### Release

- [ ] Import into period 1 aggregated issuance data
- [ ] Import into period 0 current issuance data
