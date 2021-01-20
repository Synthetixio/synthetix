const { contract, artifacts } = require('@nomiclabs/buidler');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const TestableBytes32Set = artifacts.require('TestableBytes32Set');

const { toBytes32 } = require('../..');

contract('Bytes32SetLib', accounts => {
	let set;

	const testBytes32 = ['a', 'b', 'c', 'd', 'e'].map(toBytes32);
	const otherBytes32 = ['f', 'g', 'h', 'i', 'j'].map(toBytes32);

	before(async () => {
		set = await TestableBytes32Set.new();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('Adding elements', async () => {
		for (const account of testBytes32) {
			assert.isFalse(await set.contains(account));
		}
		assert.bnEqual(await set.size(), 0);

		for (let i = 0; i < testBytes32.length; i++) {
			await set.add(testBytes32[i]);
			// included
			assert.isTrue(await set.contains(testBytes32[i]));
			// not included
			assert.isFalse(await set.contains(otherBytes32[i]));
			assert.bnEqual(await set.size(), i + 1);
		}
	});

	it('Adding existing elements does nothing', async () => {
		for (const bytes of testBytes32) {
			await set.add(bytes);
		}

		const preSize = await set.size();
		const preElements = [];

		for (let i = 0; i < preSize; i++) {
			preElements.push(await set.element(i));
		}

		for (const bytes of testBytes32) {
			await set.add(bytes);
		}

		const postSize = await set.size();
		const postElements = [];

		for (let i = 0; i < postSize; i++) {
			postElements.push(await set.element(i));
		}
		assert.bnEqual(postSize, preSize);
		assert.bnEqual(JSON.stringify(postElements), JSON.stringify(preElements));
	});

	it('Removing elements', async () => {
		for (const account of testBytes32) {
			await set.add(account);
		}

		const remainingBytes = Array.from(testBytes32);
		const bytesToRemove = ['b', 'e', 'c', 'd', 'a'].map(toBytes32);

		for (let i = 0; i < testBytes32.length; i++) {
			const account = bytesToRemove[i];
			remainingBytes.splice(remainingBytes.indexOf(account), 1);
			remainingBytes.sort();
			await set.remove(account);

			const elements = [];
			const size = await set.size();
			for (let j = 0; j < size; j++) {
				elements.push(await set.element(j));
			}
			elements.sort();

			assert.equal(JSON.stringify(elements), JSON.stringify(remainingBytes));
			assert.bnEqual(size, remainingBytes.length);
		}
	});

	it("Can't remove nonexistent elements", async () => {
		assert.bnEqual(await set.size(), 0);
		await assert.revert(set.remove(toBytes32('a')), 'Element not in set.');
		await set.add(toBytes32('a'));
		await assert.revert(set.remove(toBytes32('b')), 'Element not in set.');
		await set.add(toBytes32('b'));
		await set.remove(toBytes32('a'));
		await assert.revert(set.remove(toBytes32('a')), 'Element not in set.');
	});

	it('Retrieving pages', async () => {
		const windowSize = 2;
		let ms;

		// Empty list
		for (let i = 0; i < testBytes32.length; i++) {
			ms = await set.getPage(i, 2);
			assert.equal(ms.length, 0);
		}

		for (const address of testBytes32) {
			await set.add(address);
		}

		// Single elements
		for (let i = 0; i < testBytes32.length; i++) {
			ms = await set.getPage(i, 1);
			assert.equal(ms.length, 1);
			assert.equal(ms[0], testBytes32[i]);
		}

		// shifting window
		for (let i = 0; i < testBytes32.length - windowSize; i++) {
			ms = await set.getPage(i, windowSize);
			assert.equal(ms.length, windowSize);

			for (let j = 0; j < windowSize; j++) {
				assert.equal(ms[j], testBytes32[i + j]);
			}
		}

		// entire list
		ms = await set.getPage(0, testBytes32.length);
		assert.equal(ms.length, testBytes32.length);
		for (let i = 0; i < testBytes32.length; i++) {
			assert.equal(ms[i], testBytes32[i]);
		}

		// Page extends past end of list
		ms = await set.getPage(testBytes32.length - windowSize, windowSize * 2);
		assert.equal(ms.length, windowSize);
		for (let i = testBytes32.length - windowSize; i < testBytes32.length; i++) {
			const j = i - (testBytes32.length - windowSize);
			assert.equal(ms[j], testBytes32[i]);
		}

		// zero page size
		for (let i = 0; i < testBytes32.length; i++) {
			ms = await set.getPage(i, 0);
			assert.equal(ms.length, 0);
		}

		// index past the end
		for (let i = 0; i < 3; i++) {
			ms = await set.getPage(testBytes32.length, i);
			assert.equal(ms.length, 0);
		}

		// Page size larger than entire list
		ms = await set.getPage(0, testBytes32.length * 2);
		assert.equal(ms.length, testBytes32.length);
		for (let i = 0; i < testBytes32.length; i++) {
			assert.equal(ms[i], testBytes32[i]);
		}
	});
});
