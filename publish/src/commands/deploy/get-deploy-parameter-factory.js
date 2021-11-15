'use strict';

const { yellow } = require('chalk');

const { defaults } = require('../../../..');

module.exports = ({ params, ignoreCustomParameters }) => async name => {
	const defaultParam = defaults[name];
	if (ignoreCustomParameters) {
		return defaultParam;
	}

	let effectiveValue = defaultParam;

	const param = (params || []).find(p => p.name === name);

	if (param) {
		effectiveValue = param.value;
	}

	if (effectiveValue !== defaultParam) {
		console.log(
			yellow(
				`PARAMETER OVERRIDE: Overriding default ${name} with ${JSON.stringify(
					effectiveValue
				)}, specified in params.json.`
			)
		);
	}

	return effectiveValue;
};
