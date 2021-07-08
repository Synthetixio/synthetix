module.exports = {
	// gnosis safe abi
	abi: [
		{
			constant: false,
			inputs: [{ internalType: 'bytes32', name: 'hashToApprove', type: 'bytes32' }],
			name: 'approveHash',
			outputs: [],
			payable: false,
			stateMutability: 'nonpayable',
			type: 'function',
		},
		{
			constant: true,
			inputs: [],
			name: 'nonce',
			outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
			payable: false,
			stateMutability: 'view',
			type: 'function',
		},
		{
			constant: true,
			inputs: [
				{ internalType: 'address', name: 'to', type: 'address' },
				{ internalType: 'uint256', name: 'value', type: 'uint256' },
				{ internalType: 'bytes', name: 'data', type: 'bytes' },
				{
					internalType: 'enum Enum.Operation',
					name: 'operation',
					type: 'uint8',
				},
				{ internalType: 'uint256', name: 'safeTxGas', type: 'uint256' },
				{ internalType: 'uint256', name: 'baseGas', type: 'uint256' },
				{ internalType: 'uint256', name: 'gasPrice', type: 'uint256' },
				{ internalType: 'address', name: 'gasToken', type: 'address' },
				{ internalType: 'address', name: 'refundReceiver', type: 'address' },
				{ internalType: 'uint256', name: '_nonce', type: 'uint256' },
			],
			name: 'getTransactionHash',
			outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
			payable: false,
			stateMutability: 'view',
			type: 'function',
		},
	],
};
