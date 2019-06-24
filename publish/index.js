'use strict';

const program = require('commander');

require('pretty-error').start();
require('dotenv').config();

require('./src/commands/build').cmd(program);
require('./src/commands/deploy').cmd(program);
require('./src/commands/generate-token-list').cmd(program);
require('./src/commands/nominate').cmd(program);
require('./src/commands/owner').cmd(program);
require('./src/commands/purge-synths').cmd(program);
require('./src/commands/remove-synths').cmd(program);
require('./src/commands/replace-synths').cmd(program);
require('./src/commands/verify').cmd(program);

program.parse(process.argv);
