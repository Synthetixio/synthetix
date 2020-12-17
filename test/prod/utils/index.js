const { detectNetworkName } = require('./detectNetwork');
const { connectContract, connectContracts } = require('./connectContract');
const {
	ensureAccountHasEther,
	ensureAccountHasSNX,
	ensureAccountHassUSD,
} = require('./ensureAccountHasBalance');
const { exchangeSynths } = require('./exchangeSynths');
const { readSetting, writeSetting } = require('./systemSettings');
const { skipWaitingPeriod, skipStakeTime } = require('./skipWaiting');
const { simulateExchangeRates } = require('./exchangeRates');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { mockOptimismBridge } = require('./optimismBridge');
const { implementsVirtualSynths } = require('./virtualSynths');
const { knownAccounts, pwnAccountsOnNetwork } = require('./pwnAccounts');
const { setup } = require('./setup');

module.exports = {
	detectNetworkName,
	connectContract,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	exchangeSynths,
	readSetting,
	writeSetting,
	skipWaitingPeriod,
	skipStakeTime,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	implementsVirtualSynths,
	knownAccounts,
	pwnAccountsOnNetwork,
	setup,
};
