'use strict';

const { yellow } = require('chalk');

const { defaults } = require('../../../..');

const { confirmAction } = require('../../util');

module.exports = ({ params, yes, ignoreCustomParameters }) => async name => {
	const defaultParam = defaults[name];
	if (ignoreCustomParameters) {
		return defaultParam;
	}

	let effectiveValue = defaultParam;

	const param = params[name];

	if (param) {
		if (!yes) {
			try {
				await confirmAction(
					yellow(
						`⚠⚠⚠ WARNING: Found an entry for ${name} in params.js. Specified value is ${param} and default is ${defaultParam}.` +
							'\nDo you want to use the specified value (default otherwise)? (y/n) '
					)
				);

				effectiveValue = param;
			} catch (err) {
				console.error(err);
			}
		} else {
			// yes = true
			effectiveValue = param;
		}
	}

	if (effectiveValue !== defaultParam) {
		console.log(
			yellow(
				`PARAMETER OVERRIDE: Overriding default ${name} with ${effectiveValue}, specified in params.json.`
			)
		);
	}

	return effectiveValue;
};
