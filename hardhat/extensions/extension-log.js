const { extendEnvironment } = require('hardhat/config');
const { gray } = require('chalk');

const log = (...text) => console.log(gray(...['└─> [DEBUG]'].concat(text)));

extendEnvironment(hre => {
	hre.log = log;
});
