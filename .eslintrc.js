module.exports = {
	extends: ['standard', 'plugin:prettier/recommended', 'plugin:node/recommended'],
	globals: {
		artifacts: true,
		assert: true,
		contract: true,
		web3: true,
	},
	env: {
		mocha: true,
		node: true,
	},
	plugins: ['havven'],
	rules: {
		'havven/no-assert-revert-without-await': 'error',
		'havven/no-assert-invalid-opcode-without-await': 'error',
		'prefer-arrow-callback': 'error',
		'prefer-const': 'error',
		'no-process-exit': 'off',
	},
};
