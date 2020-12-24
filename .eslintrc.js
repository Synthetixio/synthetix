module.exports = {
	extends: ['standard', 'plugin:prettier/recommended', 'plugin:node/recommended'],
	globals: {},
	env: {
		mocha: true,
		node: true,
	},
	plugins: ['havven', 'no-only-tests'],
	rules: {
		'havven/no-assert-revert-without-await': 'error',
		'havven/no-assert-invalid-opcode-without-await': 'error',
		'prefer-arrow-callback': 'error',
		'prefer-const': 'error',
		'no-process-exit': 'off',
		'standard/computed-property-even-spacing': 'off',
		'no-only-tests/no-only-tests': 'error',
	},
};
