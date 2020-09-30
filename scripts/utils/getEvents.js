async function getPastEvents({ contract }) {
	const events = await contract.queryFilter();
}

module.exports = {
	getPastEvents,
};
