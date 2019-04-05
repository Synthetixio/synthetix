## Tests to cover

### Ratio Penalties

- [x] penalty of 25% when users claim rewards between 22%-30% collateralisation ratio
- [x] penalty of 50% when users claim rewards between 30%-40% collateralisation ratio
- [ ] penalty of 75% when users claim rewards between 40%-50% collateralisation ratio
- [ ] penalty of 90% when users claim rewards between > 50% collateralisation ratio
- [ ] penalty of 100% when users claim rewards between > 100% collateralisation ratio

### 3 accounts with 33.33 SNX

- [x] all issueMAX sUSD, claim in p1, all get 33.33 of rewards
- [x] all issueMAX sUSD, all claim in p6, all get 33.33 of rewards
- [x] all issueMAX sUSD, Acc1 claims in p1 and then leaves, then Acc2&3 claim, all get 33.33 of rewards
- [ ] p1: Acc1 & 2 issue sUSD & Acc3 issues sBTC then shift rate up 20% then leaves then calc rewards, close p.
- [ ] p1: Acc1 & 2 mints 10K and converts all to BTC which increases 50% then Acc3 mints 10K sUSD and now Acc3 has 20% of the debt/rewards

- [ ] now in p2 Acc1 burns all and leaves (-40%) and Acc2 has 67% and Acc3 33% rewards allocated as such
- [ ] p3: Acc1 mints 20K (40%) close p (40,40,20)

- [ ] Issue sBTC then shift rate down 20% then calc rewards

### 3 accounts issue 33.33 10K suSD each a

- [ ] p2 Acc1 Issues 20K sUSD now has 50% debt/rewards Acc2&3 25%
- [ ] p3 Acc1 Burns all then mints 10K then mint 10K debt/rewards 50%
- [ ] duplicate previous tests but wait till end of 6 weeks claimable is the same

### accounts not claiming

- [ ] Acc 1 doesnt claim and rewards roll over
- [ ] Acc2 & 3 should get the extra amount
