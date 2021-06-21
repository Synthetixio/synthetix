const ethers = require('ethers');
const { gray, yellow } = require('chalk');
// const { Base58 } = require('@ethersproject/basex');

// const ensAbi = [
// 	'function setOwner(bytes32 node, address owner) external @500000',
// 	'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external @500000',
// 	'function setResolver(bytes32 node, address resolver) external @500000',
// 	'function owner(bytes32 node) external view returns (address)',
// 	'function resolver(bytes32 node) external view returns (address)',
// ];

// const resolverAbi = [
// 	'function interfaceImplementer(bytes32 nodehash, bytes4 interfaceId) view returns (address)',
// 	'function addr(bytes32 nodehash) view returns (address)',
// 	'function setAddr(bytes32 nodehash, address addr) @500000',
// 	'function name(bytes32 nodehash) view returns (string)',
// 	'function setName(bytes32 nodehash, string name) @500000',
// 	'function text(bytes32 nodehash, string key) view returns (string)',
// 	'function setText(bytes32 nodehash, string key, string value) @500000',
// 	'function contenthash(bytes32 nodehash) view returns (bytes)',
// 	'function setContenthash(bytes32 nodehash, bytes contenthash) @500000',
// ];

/**
 * Set the IPFS Content Hash, It mimics ethers setContenthash only available as CLI
 *
 *
 * @returns transaction hash if successful, true if user completed, or falsy otherwise
 */
const setContentHash = async ({ name, hash, txConfig, dryRun }) => {
	if (!hash) {
		throw new Error('Missing hash. Please add and retry.');
	}
	if (!name) {
		throw new Error('Missing name. Please add and retry.');
	}

	// Check hash
	const bytes = Base58.decode(hash);
	if (bytes.length !== 34 || bytes[0] !== 18 || bytes[1] !== 32) {
		throw new Error('Unsupported IPFS hash');
	}
	// const multihash = ethers.utils.concat(['0xe3010170', bytes]);
	// const multihashHex = ethers.utils.hexlify(multihash);
	const nodehash = ethers.utils.namehash(name);

	console.log(
		gray('Setting Content Hash:'),
		yellow(name),
		yellow(
			JSON.stringify({
				Nodehash: nodehash,
				'Content Hash': hash,
			})
		)
	);

	return new Promise(resolve => resolve('some_hash'));
	/*
    async run(): Promise<void> {

        let resolver = await this.getResolver(this.nodehash);
        await resolver.setContenthash(this.nodehash, this.multihash);
    }

	// check to see if action required
	console.log(yellow(`Attempting action: ${action}`));


	if (dryRun) {
			_dryRunCounter++;
			hash = '0x' + _dryRunCounter.toString().padStart(64, '0');
		} else {
			target = target.connect(account);

			const tx = await target[write](...argumentsForWriteFunction, params);
			const receipt = await tx.wait();

			hash = receipt.transactionHash;
			gasUsed = receipt.gasUsed;

		}

		console.log(
			green(
				`${
					dryRun ? '[DRY RUN] ' : ''
				}Successfully completed ${action} in hash: ${hash}. Gas used: ${(gasUsed / 1e6).toFixed(
					2
				)}m `
			)
		);

		return { mined: true, hash };

		if (dryRun) {
			console.log(
				gray(`[DRY RUN] Would append owner action of the following:\n${stringify(ownerAction)}`)
			);
		} else {
			appendOwnerAction(ownerAction);
		}
		return { pending: true };
		*/
};

/*
getEns(): ethers.Contract {
	return new ethers.Contract(this.network.ensAddress, ensAbi, this.accounts[0] || this.provider);
}

async getResolver(nodehash: string): Promise<ethers.Contract> {
	if (!this._ethAddressCache[nodehash]) {
		this._ethAddressCache[nodehash] = await this.getEns().resolver(nodehash);
	}
	return new ethers.Contract(this._ethAddressCache[nodehash], resolverAbi, this.accounts[0] || this.provider);
}

// SUPER
abstract class AccountPlugin extends EnsPlugin {
    name: string;
    nodehash: string;

    async _setValue(key: string, value: string): Promise<void> {
        ethers.utils.defineReadOnly<any, any>(this, key, value);
        if (key === "name") {
            await this._setValue("nodehash", ethers.utils.namehash(value));
        }
    }

    async prepareArgs(args: Array<string>): Promise<void> {
        await super.prepareArgs(args);

        let helpLine = ethers.utils.getStatic<() => Help>(this.constructor, "getHelp")().name;
        let params = helpLine.split(" ");
        let command = params[0];
        params = params.slice(1);

        if (this.accounts.length !== 1) {
            this.throwError(command + " requires an account");
        }

        if (args.length !== params.length) {
            this.throwError(command + " requires exactly " + listify(params));
        }

        for (let i = 0; i < params.length; i++ ) {
            await this._setValue(params[i].toLowerCase(), args[i]);
        }
    }
}


abstract class EnsPlugin extends Plugin {
    _ethAddressCache: { [ addressOrInterfaceId: string ]: string };

    constructor() {
        super();
        ethers.utils.defineReadOnly(this, "_ethAddressCache", { });
    }

    getEns(): ethers.Contract {
        return new ethers.Contract(this.network.ensAddress, ensAbi, this.accounts[0] || this.provider);
    }ddd

    async getResolver(nodehash: string): Promise<ethers.Contract> {
        if (!this._ethAddressCache[nodehash]) {
            this._ethAddressCache[nodehash] = await this.getEns().resolver(nodehash);
        }
        return new ethers.Contract(this._ethAddressCache[nodehash], resolverAbi, this.accounts[0] || this.provider);
    }

    async getEthInterfaceAddress(interfaceId: string): Promise<string> {
        let ethNodehash = ethers.utils.namehash("eth");
        if (!this._ethAddressCache[interfaceId]) {
            let resolver = await this.getResolver(ethNodehash);
            this._ethAddressCache[interfaceId] = await resolver.interfaceImplementer(ethNodehash, interfaceId);
        }
        return this._ethAddressCache[interfaceId];
    }

    async getEthController(): Promise<ethers.Contract> {
        let address = await this.getEthInterfaceAddress(InterfaceID_Controller);
        return new ethers.Contract(address, ethControllerAbi, this.accounts[0] || this.provider);
    }

    async getEthLegacyRegistrar(): Promise<ethers.Contract> {
        let address = await this.getEthInterfaceAddress(InterfaceID_Legacy);
        return new ethers.Contract(address, ethLegacyRegistrarAbi, this.accounts[0] || this.provider);
    }

    async getEthRegistrar(): Promise<ethers.Contract> {
        //let address = await this.getEthInterfaceAddress(InterfaceID_ERC721);
        let address = await this.getEns().owner(ethers.utils.namehash("eth"));
        return new ethers.Contract(address, ethRegistrarAbi, this.accounts[0] || this.provider);
    }
}

*/

module.exports = {
	setContentHash,
};
