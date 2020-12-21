const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const {
	ensureAccountHasEther,
	ensureAccountHasSNX,
	ensureAccountHassUSD,
	ensureAccountHasRenBTC,
} = require('./ensureAccountHasBalance');
const { exchangeSynths } = require('./exchangeSynths');
const { readSetting, writeSetting } = require('./systemSettings');
const { skipWaitingPeriod, skipStakeTime } = require('./skipWaiting');
const { simulateExchangeRates } = require('./exchangeRates');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { mockOptimismBridge } = require('./optimismBridge');
const { implementsVirtualSynths } = require('./virtualSynths');
const { implementsMultiCollateral } = require('./multicollateral');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	ensureAccountHasRenBTC,
	exchangeSynths,
	readSetting,
	writeSetting,
	skipWaitingPeriod,
	skipStakeTime,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	implementsVirtualSynths,
	implementsMultiCollateral,
};
