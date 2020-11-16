const ethers = require('ethers');

const { initCrossDomainMessengers } = require('@eth-optimism/ovm-toolchain');

const testUtils = require('../../../test/utils');
const { setupProvider } = testUtils();

const deploy = async () => {
	const { wallet } = setupProvider({
		providerUrl: 'https://goerli.infura.io/v3/33bec08ecdbc45e7bfab528c0f25e51b',
		privateKey: '0xd829c1bdcd19138430c2b52520222541e77d971a595a7e41326b0b20eac00dc0',
	});

	const messengers = await initCrossDomainMessengers(1, 5, ethers, wallet);

	console.log('messenger 1', messengers.l1CrossDomainMessenger.address);
	console.log('messenger 2', messengers.l2CrossDomainMessenger.address);
};

deploy();
