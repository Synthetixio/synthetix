const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const {
	ensureAccountHasEther,
	ensureAccountHasSNX,
	ensureAccountHassUSD,
	ensureAccountHassETH,
} = require('./ensureAccountHasBalance');
const { exchangeSynths } = require('./exchangeSynths');
const { readSetting, writeSetting } = require('./systemSettings');
const { skipWaitingPeriod, skipStakeTime } = require('./skipWaiting');
const { simulateExchangeRates, avoidStaleRates } = require('./exchangeRates');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { mockOptimismBridge } = require('./optimismBridge');
const { implementsVirtualSynths } = require('./virtualSynths');
const { implementsMultiCollateral } = require('./multicollateral');
const { resumeSystem } = require('./systemStatus');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	ensureAccountHassETH,
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
	avoidStaleRates,
	resumeSystem,
};
