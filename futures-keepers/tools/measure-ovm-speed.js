const ethers = require('ethers');
const provider = new ethers.providers.WebSocketProvider(); // connect to localhost
provider.on('block', blockNumber => {
	console.log(blockNumber + ',' + +new Date());
});
