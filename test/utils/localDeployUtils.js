'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
	fetchGanacheUsers() {
		return Object.entries(
			JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'keys.json'))).private_keys
		).map(([pub, pri]) => ({
			public: pub,
			private: `0x${pri}`,
		}));
	},
};
