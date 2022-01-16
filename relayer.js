const dgram = require('dgram');
const ethers = require('ethers');

const { EventEmitter } = require('events');

const sleep = ms => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

const PORT = 9172;

const WAIT_SYNC = 30000;

export async function relayer({
    peers,
    chains,
    signSigner,
    makePushSigner,
}) {
    // create receiver socket
    const receiver = dgram.createSocket('udp4');

    // create message bus
    const msgBus = new EventEmitter();

    receiver.on('listening', () => {
        console.log('receiver listening on 9172');
    });

    receiver.on('error', (err) => {
        console.error('socket error:', err);
    });

    receiver.on('message', (msg, rinfo) => {
        try {
            // unpack
            const sigHash = msg.slice(0, 32).toString('hex');
            const sig = msg.slice(32).toString('hex');

            console.log('recv', sigHash);

            // deliver this where it needs to go
            msgBus.emit(sigHash, sig);
        } catch(err) {
            console.error('could not parse received message:', err);
        }
    });

    receiver.bind(PORT);

    async function broadcast({ signHash, sig }) {
        const msg = Buffer.concat(
            Buffer.from(signHash, 'hex'), 
            Buffer.from(sig, 'hex')
        );

        console.log('cast', signHash);

        for (const ip of ips) {
            receiver.send(msg, 9172, ip.addr);
        }
    }

    async function signatureGossip(signHash, mySignature) {

        for (let i = 0;i < MAX_GOSSIP_BROADCASTS;i++) {
            // first, verify that the txn has not been submitted

            // broadcast
            await broadcast(signHash, mySignature);

            await sleep(WAIT_BROADCAST);
        }
    }

    async function handlePair(sendChain, recvChain) {
        console.log('init', sendChain, recvChain);
        const pushSigner = makePushSigner(recvChain.provider);

        let listenedHash = null;

        while(true) {
            const outNonce = await sendChain.contract.outgoingNonces(recvChain.id);
            const inNonce = await recvChain.contract.incomingNonces(sendChain.id);
    
            sendMessage: for (let i = inNonce.toNumber() + 1;i <= outNonce.toNumber();i++) {
                if (listenedHash) {
                    msgBus.off(listenedHash);
                }

                // get message data (using log)
                const evt = await sendChain.contract.queryFilter(
                    sendChain.contract.filters.MessagePosted(recvChain.id, i)
                );

                if (!evt.length) {
                    console.warn(`could not get event data for idx ${i} (${sendChain.id, recvChain.id})`);

                    // reset
                    break;
                }

                // verify confirmations
                const currentBlockNumber = sendChain.provider.getBlockNumber();
                if (evt[0].blockNumber > currentBlockNumber - sendChain.requiredConfirmations) {
                    break; // message (and all that follow) needs more time before relay
                }

                console.log('make', sendChain.id, i);
                const signHash = ethers.utils.solidityKeccak256(
                    ['bytes32', 'uint', 'uint', 'bytes32', 'bytes', 'uint'],
                    [
                        "Synthetixv2x",
                        sendChain.id,
                        i,
                        evt[0].args.targetContract,
                        evt[0].args.data,
                        evt[0].args.gasLimit
                    ]
                );

                const mySignature = await signSigner.signMessage(ethers.utils.arrayify(signHash));

                const collectedSigs = new Set();
                const requiredSigs = await recvChain.requiredSignatures();

                collectedSigs.add(mySignature);

                msgBus.on(signHash, async (sig) => {
                    // ensure its a valid signature
                    let addr = ethers.utils.verifyMessage(signHash, sig);
                    if (await sendChain.contract.signers(addr)) {
                        collectedSigs.add(sig);
                    }
                });

                listenedHash = signHash;

                while (true) {
                    // check the message index
                    const txnNonce = await pushSigner.getTransactionCount();
                    const inNonce = await recvChain.contract.incomingNonces(sendChain.id);

                    if (inNonce > i) {
                        break; // message was relayed by another
                    }
                    if (inNonce < i) {
                        console.error(`reorg detected (${recvChain.id})`);
                        break sendMessage;
                    }

                    if (collectedSigs.length < requiredSigs) {
                        await signatureGossip(signHash, mySignature);
                    }
                    else {

                        // relay
                        // if other nodes send other valid transactions on the same txn nonce, that
                        // is fine, we retry multiple times until the message has been forwarded
                        console.log('send', sendChain.id, i);
                        try {
                            const txnData = recvChain.contract.interface.encodeFunctionData('receive',
                                [sendChain.id,
                                i,
                                evt[0].args.targetContract,
                                evt[0].args.data,
                                evt[0].args.gasLimit,
                                sigs]
                            );

                            await pushSigner.sendTransaction({
                                to: recvChain.contract.address,
                                data: txnData,
                                nonce: txnNonce,
                            });
                        } catch(err) {
                            console.log('drop');
                        }
                    }
                }
            }

            // all messages sent
            await sleep(WAIT_SYNC);
        }
    }

    // check every send combo, send whichever message is oldest
    for (const sendChain of chains) {
        for (const recvChain of chains) {
            if (sendChain == recvChain) {
                continue;
            }

            handlePair(sendChain, recvChain);
        }
    }
}

if (require.main === module) {

    // read configuration file
    const config = JSON.parse(fs.readFileSync(process.argv[2]));

    // some remapping/init

    relayer({
        peers,
        chains,
        signSigner,
        makePushSigner
    });
}