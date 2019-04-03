'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const loader = async network => {
	const deploymentPath = path.join(__dirname, 'deployed', network, 'deployment.json');

	const deployment = JSON.parse(fs.readFileSync(deploymentPath));

	Object.keys(deployment).forEach(async contract => {
		const { address } = deployment[contract];
		const etherscanUrl =
			network === 'mainnet'
				? 'https://api.etherscan.io/api'
				: `https://api-${network}.etherscan.io/api`;

		let result = await axios.get(etherscanUrl, {
			params: {
				module: 'contract',
				action: 'getabi',
				address,
				apikey: process.env.ETHERSCAN_KEY,
			},
		});

		console.log(contract, result.data.result);
		process.exit();
	});
};

(async () => {
	await loader('kovan');
})();
