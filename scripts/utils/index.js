const { getContract } = require('./getContract');
const { setupProvider } = require('./setupProvider');
const { wait } = require('./wait');
const { runTx } = require('./runTx');
const { getPastEvents } = require('./getEvents');

module.exports = {
	getContract,
	setupProvider,
	wait,
	runTx,
	getPastEvents,
};
