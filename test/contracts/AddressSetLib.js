const { contract, artifacts } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const TestableAddressSet = artifacts.require('TestableAddressSet');

contract('AddressSetLib @ovm-skip', accounts => {
	let set;

	const [a, b, c, d, e] = accounts;
	const testAccounts = [a, b, c, d, e];

	before(async () => {
		set = await TestableAddressSet.new();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('Adding elements', async () => {
		for (const account of testAccounts) {
			assert.isFalse(await set.contains(account));
		}
		assert.bnEqual(await set.size(), 0);

		for (let i = 0; i < testAccounts.length; i++) {
			await set.add(testAccounts[i]);
			// included
			for (const account of accounts.slice(0, i + 1)) {
				assert.isTrue(await set.contains(account));
			}
			// not included
			for (const account of accounts.slice(i + 1)) {
				assert.isFalse(await set.contains(account));
			}
			assert.bnEqual(await set.size(), i + 1);
		}
	});

	it('Adding existing elements does nothing', async () => {
		for (const account of testAccounts) {
			await set.add(account);
		}

		const preSize = await set.size();
		const preElements = [];

		for (let i = 0; i < preSize; i++) {
			preElements.push(await set.element(i));
		}

		for (const account of testAccounts) {
			await set.add(account);
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
		for (const account of testAccounts) {
			await set.add(account);
		}

		const remainingAccounts = Array.from(testAccounts);
		const accountsToRemove = [b, e, c, d, a];

		for (let i = 0; i < testAccounts.length; i++) {
			const account = accountsToRemove[i];
			remainingAccounts.splice(remainingAccounts.indexOf(account), 1);
			remainingAccounts.sort();
			await set.remove(account);

			const elements = [];
			const size = await set.size();
			for (let j = 0; j < size; j++) {
				elements.push(await set.element(j));
			}
			elements.sort();

			assert.equal(JSON.stringify(elements), JSON.stringify(remainingAccounts));
			assert.bnEqual(size, remainingAccounts.length);
		}
	});

	it("Can't remove nonexistent elements", async () => {
		assert.bnEqual(await set.size(), 0);
		await assert.revert(set.remove(a), 'Element not in set.');
		await set.add(a);
		await assert.revert(set.remove(b), 'Element not in set.');
		await set.add(b);
		await set.remove(a);
		await assert.revert(set.remove(a), 'Element not in set.');
	});

	it('Retrieving pages', async () => {
		const windowSize = 2;
		let ms;

		// Empty list
		for (let i = 0; i < testAccounts.length; i++) {
			ms = await set.getPage(i, 2);
			assert.equal(ms.length, 0);
		}

		for (const address of testAccounts) {
			await set.add(address);
		}

		// Single elements
		for (let i = 0; i < testAccounts.length; i++) {
			ms = await set.getPage(i, 1);
			assert.equal(ms.length, 1);
			assert.equal(ms[0], testAccounts[i]);
		}

		// shifting window
		for (let i = 0; i < testAccounts.length - windowSize; i++) {
			ms = await set.getPage(i, windowSize);
			assert.equal(ms.length, windowSize);

			for (let j = 0; j < windowSize; j++) {
				assert.equal(ms[j], testAccounts[i + j]);
			}
		}

		// entire list
		ms = await set.getPage(0, testAccounts.length);
		assert.equal(ms.length, testAccounts.length);
		for (let i = 0; i < testAccounts.length; i++) {
			assert.equal(ms[i], testAccounts[i]);
		}

		// Page extends past end of list
		ms = await set.getPage(testAccounts.length - windowSize, windowSize * 2);
		assert.equal(ms.length, windowSize);
		for (let i = testAccounts.length - windowSize; i < testAccounts.length; i++) {
			const j = i - (testAccounts.length - windowSize);
			assert.equal(ms[j], testAccounts[i]);
		}

		// zero page size
		for (let i = 0; i < testAccounts.length; i++) {
			ms = await set.getPage(i, 0);
			assert.equal(ms.length, 0);
		}

		// index past the end
		for (let i = 0; i < 3; i++) {
			ms = await set.getPage(testAccounts.length, i);
			assert.equal(ms.length, 0);
		}

		// Page size larger than entire list
		ms = await set.getPage(0, testAccounts.length * 2);
		assert.equal(ms.length, testAccounts.length);
		for (let i = 0; i < testAccounts.length; i++) {
			assert.equal(ms[i], testAccounts[i]);
		}
	});
});
