const Owned = artifacts.require('Owned');

contract("Owned - Test contract deployment", function (accounts) {

  const deployerAcct = (accounts[0]);
  const acct1 = accounts[1];

  it("should revert when owner parameter is passed as 0x", async function() {
    try {
      await Owned.new('0x0000000000000000000000000000000000000000', {
        from: deployerAcct
      });
    } catch (error) {
      console.log(`Transaction error :: ${error}`);
      assert.include(error.message, 'revert');
    }
  });

  // TODO check events on contract creation
  it("should set owner addrs on deployment", async function () {
    let ownedContractInstance = await Owned.new(acct1, {
      from: deployerAcct
    });
    const owner = await ownedContractInstance.owner.call();
    assert.equal(owner, acct1);
  });

});

contract("Owned - Pre deployed contract", async function (accounts) {

  const acct1 = (accounts[1]);
  const acct2 = (accounts[2]);
  const acct3 = (accounts[3]);
  const acct4 = (accounts[4]);

  it("should set constructor value", async function () {
    let ownedContractInstance = await Owned.deployed();
    const owner = await ownedContractInstance.owner.call();
    assert.equal(owner, acct1);
  });

  it("should not nominate new owner when not invoked by current contract owner", async function () {
    let ownedContractInstance = await Owned.deployed();
    const nominatedOwner = acct3;
    try {
      await ownedContractInstance.nominateNewOwner(nominatedOwner, { from: acct2 });
    } catch (error) {
      console.log(`Transaction error :: ${error}`);
    }
    const nominatedOwnerFrmContract = await ownedContractInstance.nominatedOwner.call();
    assert.equal(nominatedOwnerFrmContract, '0x0000000000000000000000000000000000000000');
  });

  it("should nominate new owner when invoked by current contract owner", async function () {
    let ownedContractInstance = await Owned.deployed();
    const nominatedOwner = acct2;

    const txn = await ownedContractInstance.nominateNewOwner(nominatedOwner, { from: acct1 });
    assert.equal(txn.logs[0].event, 'OwnerNominated');
    assert.equal(txn.logs[0].args.newOwner, nominatedOwner);

    const nominatedOwnerFrmContract = await ownedContractInstance.nominatedOwner.call();
    assert.equal(nominatedOwnerFrmContract, nominatedOwner);
  });

  it("should not accept new owner nomination when not invoked by nominated owner", async function () {
    let ownedContractInstance = await Owned.deployed();
    const nominatedOwner = acct3;

    try {
      await ownedContractInstance.acceptOwnership({ from: acct4 });
    } catch (error) {
      console.log(`Transaction error :: ${error}`);
    }
    const owner = await ownedContractInstance.owner.call();
    assert.notEqual(owner, nominatedOwner);
  });

  it("should accept new owner nomination when invoked by nominated owner", async function () {
    let ownedContractInstance = await Owned.deployed();
    const nominatedOwner = acct2;

    const txn = await ownedContractInstance.acceptOwnership({ from: acct2 });
    assert.equal(txn.logs[0].event, 'OwnerChanged');
    assert.equal(txn.logs[0].args.oldOwner, acct1);
    assert.equal(txn.logs[0].args.newOwner, acct2);

    const owner = await ownedContractInstance.owner.call();
    const nominatedOwnerFrmCtct = await ownedContractInstance.nominatedOwner.call();

    assert.equal(owner, nominatedOwner);
    assert.equal(nominatedOwnerFrmCtct, '0x0000000000000000000000000000000000000000');
  });

});
