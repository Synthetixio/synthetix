'use strict';

const program = require('commander');

require('pretty-error').start();
require('dotenv').config();

require('./src/commands/build')(program);
require('./src/commands/deploy')(program);
require('./src/commands/generate-token-list')(program);
require('./src/commands/nominate')(program);
require('./src/commands/owner')(program);
require('./src/commands/purge-synths')(program);
require('./src/commands/remove-synths')(program);
require('./src/commands/replace-synths')(program);
require('./src/commands/verify')(program);

program.parse(process.argv);
