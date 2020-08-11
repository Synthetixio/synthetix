const path = require('path');

const pkg = require('./package.json')

module.exports = {
	entry: './index.js',
	output: {
		filename: pkg.browser,
		path: path.resolve(__dirname),
		library: 'synthetix',
		libraryTarget: 'umd',
	},
	node: {
		fs: 'empty',
		child_process: 'empty',
		module: 'empty',
		readline: 'empty',
		crypto: 'empty'
	}
};
