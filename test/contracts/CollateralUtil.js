'use strict';

// const { artifacts, contract } = require('hardhat');

// const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

// const { toUnit, currentTime, fastForward } = require('../utils')();

// const { setupAllContracts, setupContract } = require('./setup');

// const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// let CollateralUtil;
// let Collateral;

contract('CollateralUtil', async accounts => {
	before(async () => {
		CollateralUtil = artifacts.require(`CollateralUtil`);
	});

    describe() {
        beforeEach() {

        }

        it('should be used irrespective of the type of collateral type', async () => {});

	    it('should get a collateral ratio for a loan', async () => {});

	    it('should get the maxLoan value for a loan', async () => {});

	    it('should get the liquidation amount', async () => {});

	    it('should get the amout of collateral redeemed', async () => {});
    }

	
});
