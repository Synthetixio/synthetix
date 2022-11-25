'use strict';

const { ethers, contract, artifacts } = require('hardhat');

const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toBytes32 } = require('../..');

const TestableAddressSetAbi = artifacts.require('TestableAddressSetProxyable').abi;
const TestableBytes32SetAbi = artifacts.require('TestableBytes32SetProxyable').abi;

contract('ProxyPerpsV2', async accounts => {
	// Signers
	let owner, user;

	// Real contracts
	let ProxyPerpsV2, TestableProxyable, TestableBytes32Set, TestableAddressSet;

	// Other mocked stuff
	const mockedAddress1 = ethers.Wallet.createRandom().address;

	beforeEach(async () => {
		let factory;
		[owner, user] = await ethers.getSigners();

		factory = await ethers.getContractFactory('ProxyPerpsV2', owner);
		ProxyPerpsV2 = await factory.deploy(owner.address);

		// Using some pre-existent Testable AddressSet as a generic target contract
		factory = await ethers.getContractFactory('TestableProxyable', owner);
		TestableProxyable = await factory.deploy(ProxyPerpsV2.address, owner.address);

		factory = await ethers.getContractFactory('TestableBytes32SetProxyable', owner);
		TestableBytes32Set = await factory.deploy(ProxyPerpsV2.address, owner.address);

		factory = await ethers.getContractFactory('TestableAddressSetProxyable', owner);
		TestableAddressSet = await factory.deploy(ProxyPerpsV2.address, owner.address);

		await TestableAddressSet.add(mockedAddress1);
	});

	it('only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: artifacts.require('ProxyPerpsV2').abi,
			ignoreParents: ['Owned'],
			hasFallback: true,
			expected: ['addRoute', 'removeRoute', '_emit'],
		});
	});

	describe('only the owner can call owned protected functions', async () => {
		describe('when calling addRoute', () => {
			it('reverts calling it by a normal user', async () => {
				await assert.revert(
					ProxyPerpsV2.connect(user).addRoute('0x00112233', TestableBytes32Set.address, false),
					'Only the contract owner may perform this action'
				);
			});

			it('sets a route when the user is the owner', async () => {
				const initialRouteLen = await ProxyPerpsV2.getRoutesLength();
				await ProxyPerpsV2.connect(owner).addRoute('0x00112233', TestableBytes32Set.address, false);

				assert.equal(
					(await ProxyPerpsV2.getRoutesLength()).toString(),
					initialRouteLen.add(1).toString()
				);
			});
		});

		describe('when calling removeRoute', () => {
			beforeEach('add a sample route to remove', async () => {
				await ProxyPerpsV2.connect(owner).addRoute('0x00112233', TestableBytes32Set.address, false);
			});

			it('reverts calling it by a normal user', async () => {
				await assert.revert(
					ProxyPerpsV2.connect(user).removeRoute('0x00112233'),
					'Only the contract owner may perform this action'
				);
			});

			it('removes a route when the user is the owner', async () => {
				const initialRouteLen = await ProxyPerpsV2.getRoutesLength();

				await ProxyPerpsV2.connect(owner).removeRoute('0x00112233');

				assert.equal(
					(await ProxyPerpsV2.getRoutesLength()).toString(),
					initialRouteLen.sub(1).toString()
				);
			});
		});
	});

	describe('only targets can call target protected functions', async () => {
		describe('when calling _emit', () => {
			let TestableProxyable;

			beforeEach('setup proxyable contract', async () => {
				const factory = await ethers.getContractFactory('TestableProxyable', owner);
				TestableProxyable = await factory.deploy(ProxyPerpsV2.address, owner.address);
			});

			it('emits an event if the contract is in the targeted routes', async () => {
				await ProxyPerpsV2.connect(owner).addRoute('0x00112233', TestableProxyable.address, false);

				const receipt = await (await TestableProxyable.emitSomeEvent()).wait();

				assert.equal(receipt.events.length, 1);
			});

			it('reverts calling it by a not enabled contract', async () => {
				await assert.revert(TestableProxyable.emitSomeEvent(), 'Must be a proxy target');
			});
		});
	});

	describe('when is not configured', async () => {
		it('reverts calling any routed function', async () => {
			const Proxied = new ethers.Contract(ProxyPerpsV2.address, TestableAddressSetAbi, user);
			await assert.revert(Proxied.add(TestableProxyable.address), 'Invalid selector');
		});
	});

	describe('targets administration (happy path)', async () => {
		let receipt, route;

		const checkTargetConfig = async (targets, routes, targetsCount, routesCount, idx) => {
			const currentTargets = await ProxyPerpsV2.getAllTargets();
			const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
			const currentRoutes = await ProxyPerpsV2.getRoutesPage(0, currentRoutesLength);
			assert.equal(currentTargets.length, targetsCount, 'invalid number of targets');
			assert.equal(currentRoutes.length, routesCount, 'invalid number of routes');

			assert.deepEqual(currentRoutes, routes, 'invalid routes configuration');
			assert.deepEqual(currentTargets, targets, 'invalid targets configuration');
		};

		const checkEvents = (receipt, events, idx) => {
			assert.equal(receipt.events.length, events.length);
			for (const event of events) {
				const currentEvent = receipt.events.find(e => e.event === event.event);
				assert.exists(currentEvent);
				assert.exists(currentEvent.args);
				assert.equal(currentEvent.args.length, event.args.length);
				for (const arg of event.args) {
					assert.equal(currentEvent.args[arg.name], arg.value);
				}
			}
		};

		const routedAddress1 = ethers.Wallet.createRandom().address;
		const routedAddress2 = ethers.Wallet.createRandom().address;
		const routedAddress3 = ethers.Wallet.createRandom().address;
		const emptyTarget = '0x0000000000000000000000000000000000000000';
		const sampleRoutes = [
			{
				selector: '0x00112211',
				implementation: routedAddress1,
				isView: false,
			},
			{
				selector: '0x00112222',
				implementation: routedAddress1,
				isView: false,
			},
			{
				selector: '0x00112233',
				implementation: routedAddress2,
				isView: false,
			},
			{
				selector: '0x00112233',
				implementation: routedAddress3,
				isView: true,
			},
		];

		it('can get a valid target selector', async () => {
			// Add 1st selector
			route = sampleRoutes[0];

			await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			const targetRoute = await ProxyPerpsV2.getRoute(route.selector);
			assert.equal(targetRoute.selector, route.selector);
			assert.equal(targetRoute.implementation, route.implementation);
			assert.equal(targetRoute.isView, route.isView);
		});

		it('gets the nil target selector for an unkown target', async () => {
			// Add 1st selector
			route = sampleRoutes[0];

			await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			const targetRoute = await ProxyPerpsV2.getRoute(sampleRoutes[1].selector);
			assert.equal(targetRoute.selector, '0x00000000');
			assert.equal(targetRoute.implementation, emptyTarget);
			assert.equal(targetRoute.isView, false);
		});

		it('can manage routes', async () => {
			// Add 1st selector
			route = sampleRoutes[0];

			receipt = await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			await checkTargetConfig([routedAddress1], [sampleRoutes[0]], 1, 1);

			checkEvents(receipt, [
				{
					event: 'RouteUpdated',
					args: [
						{ name: 'route', value: route.selector },
						{ name: 'implementation', value: route.implementation },
						{ name: 'isView', value: route.isView },
					],
				},
				{
					event: 'TargetedRouteAdded',
					args: [{ name: 'targetedRoute', value: route.implementation }],
				},
			]);

			// Add a 2nd selector to same target
			route = sampleRoutes[1];

			receipt = await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			await checkTargetConfig([routedAddress1], [sampleRoutes[0], sampleRoutes[1]], 1, 2);

			checkEvents(receipt, [
				{
					event: 'RouteUpdated',
					args: [
						{ name: 'route', value: route.selector },
						{ name: 'implementation', value: route.implementation },
						{ name: 'isView', value: route.isView },
					],
				},
			]);

			// Add a 3rd selector to another target
			route = sampleRoutes[2];

			receipt = await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			await checkTargetConfig(
				[routedAddress1, routedAddress2],
				[sampleRoutes[0], sampleRoutes[1], sampleRoutes[2]],
				2,
				3
			);

			checkEvents(receipt, [
				{
					event: 'RouteUpdated',
					args: [
						{ name: 'route', value: route.selector },
						{ name: 'implementation', value: route.implementation },
						{ name: 'isView', value: route.isView },
					],
				},
				{
					event: 'TargetedRouteAdded',
					args: [{ name: 'targetedRoute', value: route.implementation }],
				},
			]);

			// Update the 3rd selector to another target
			route = sampleRoutes[3];

			receipt = await (
				await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
			).wait();

			await checkTargetConfig(
				[routedAddress1, routedAddress3],
				[sampleRoutes[0], sampleRoutes[1], sampleRoutes[3]],
				2,
				3
			);

			checkEvents(receipt, [
				{
					event: 'RouteUpdated',
					args: [
						{ name: 'route', value: route.selector },
						{ name: 'implementation', value: route.implementation },
						{ name: 'isView', value: route.isView },
					],
				},
				{
					event: 'TargetedRouteRemoved',
					args: [{ name: 'targetedRoute', value: routedAddress2 }],
				},
				{
					event: 'TargetedRouteAdded',
					args: [{ name: 'targetedRoute', value: route.implementation }],
				},
			]);

			// Remove the 1st selector
			route = sampleRoutes[0];

			receipt = await (await ProxyPerpsV2.removeRoute(route.selector)).wait();

			await checkTargetConfig(
				[routedAddress1, routedAddress3],
				[sampleRoutes[3], sampleRoutes[1]],
				2,
				2
			);

			checkEvents(receipt, [
				{
					event: 'RouteRemoved',
					args: [{ name: 'route', value: route.selector }],
				},
			]);

			// Remove the 3rd selector
			route = sampleRoutes[3];

			receipt = await (await ProxyPerpsV2.removeRoute(route.selector)).wait();

			await checkTargetConfig([routedAddress1], [sampleRoutes[1]], 1, 1);

			checkEvents(receipt, [
				{
					event: 'RouteRemoved',
					args: [{ name: 'route', value: route.selector }],
				},
				{
					event: 'TargetedRouteRemoved',
					args: [{ name: 'targetedRoute', value: route.implementation }],
				},
			]);

			// Remove the 2nd selector
			route = sampleRoutes[1];

			receipt = await (await ProxyPerpsV2.removeRoute(route.selector)).wait();
			await checkTargetConfig([], [], 0, 0);

			checkEvents(receipt, [
				{
					event: 'RouteRemoved',
					args: [{ name: 'route', value: route.selector }],
				},
				{
					event: 'TargetedRouteRemoved',
					args: [{ name: 'targetedRoute', value: route.implementation }],
				},
			]);
		});

		describe('getting pages of routes', () => {
			beforeEach('add some routes', async () => {
				// Add some selectors
				route = sampleRoutes[0];
				await (
					await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
				).wait();

				route = sampleRoutes[1];
				await (
					await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
				).wait();

				route = sampleRoutes[2];
				await (
					await ProxyPerpsV2.addRoute(route.selector, route.implementation, route.isView)
				).wait();
			});

			it('gets all the routes', async () => {
				const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
				const currentRoutes = await ProxyPerpsV2.getRoutesPage(0, currentRoutesLength);
				assert.equal(currentRoutes.length, currentRoutesLength);
			});
			it('gets just the existent routes', async () => {
				const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
				const currentRoutes = await ProxyPerpsV2.getRoutesPage(0, currentRoutesLength + 10);
				assert.equal(currentRoutes.length, currentRoutesLength);
			});
			it('gets all the routes starting in the 1st element', async () => {
				const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
				const currentRoutes = await ProxyPerpsV2.getRoutesPage(1, currentRoutesLength - 1);
				assert.equal(currentRoutes.length, currentRoutesLength - 1);
			});
			it('gets just the routes starting in the 1st element', async () => {
				const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
				const currentRoutes = await ProxyPerpsV2.getRoutesPage(1, currentRoutesLength + 10);
				assert.equal(currentRoutes.length, currentRoutesLength - 1);
			});
			it('gets no route if start index is larger than max routes', async () => {
				const currentRoutesLength = await ProxyPerpsV2.getRoutesLength();
				const currentRoutes = await ProxyPerpsV2.getRoutesPage(10, currentRoutesLength);
				assert.equal(currentRoutes.length, 0);
			});
		});
	});

	describe('targets administration (reverts)', async () => {
		const sampleAddress = ethers.Wallet.createRandom().address;

		it('reverts attempting to set a nil selector', async () => {
			await assert.revert(
				ProxyPerpsV2.addRoute('0x00000000', sampleAddress, false),
				'Invalid nil selector'
			);
		});

		it('reverts attempting to remove an unexistent selector', async () => {
			// set a selector to remove
			await (await ProxyPerpsV2.addRoute('0x00000011', sampleAddress, false)).wait();

			// attempt to remove another selector (not set)
			await assert.revert(ProxyPerpsV2.removeRoute('0x11111111'), 'Selector not in set');

			// confirm removing the valid selector
			await (await ProxyPerpsV2.removeRoute('0x00000011')).wait();
		});
	});

	describe('when a target route is configured', async () => {
		beforeEach('configure some routes', async () => {
			// NOTE: See selectors in comment at the end of the file

			// TestableAddressSet.contains(address)
			await (await ProxyPerpsV2.addRoute('0x5dbe47e8', TestableAddressSet.address, true)).wait();
			// TestableAddressSet.add(address)
			await (await ProxyPerpsV2.addRoute('0x0a3b0a4f', TestableAddressSet.address, false)).wait();

			// TestableBytes32Set.contains(bytes32)
			await (await ProxyPerpsV2.addRoute('0x1d1a696d', TestableBytes32Set.address, true)).wait();
			// TestableBytes32Set.add(bytes32) not added
		});

		it('reverts calling a route not added', async () => {
			const Proxied = new ethers.Contract(ProxyPerpsV2.address, TestableBytes32SetAbi, user);
			await assert.revert(Proxied.add(toBytes32('Some Value')), 'Invalid selector');
		});

		describe('can call a routed contract function', async () => {
			const mockedAddress2 = ethers.Wallet.createRandom().address;

			it('can read a value (view)', async () => {
				const Proxied = new ethers.Contract(ProxyPerpsV2.address, TestableAddressSetAbi, user);

				let result = await Proxied.contains(mockedAddress2);
				assert.isBoolean(result);
				assert.isFalse(result);

				result = await Proxied.contains(mockedAddress1);
				assert.isBoolean(result);
				assert.isTrue(result);
			});

			it('can write and read a value', async () => {
				const Proxied = new ethers.Contract(ProxyPerpsV2.address, TestableAddressSetAbi, user);
				// add mockedAddress2
				await (await Proxied.add(mockedAddress2)).wait();

				const result = await Proxied.contains(mockedAddress2);
				assert.isBoolean(result);
				assert.isTrue(result);
			});
		});

		describe('can interact with a 2nd routed contract', async () => {
			it('can write and read a value', async () => {
				const Proxied = new ethers.Contract(ProxyPerpsV2.address, TestableBytes32SetAbi, user);
				// add some value
				const testValue = toBytes32('Some Value');

				let result = await Proxied.contains(testValue);
				assert.isBoolean(result);
				assert.isFalse(result);

				// Add the target to `add` values
				await (await ProxyPerpsV2.addRoute('0x446bffba', TestableBytes32Set.address, false)).wait();
				// Add a value and check again
				await (await Proxied.add(testValue)).wait();
				result = await Proxied.contains(testValue);
				assert.isBoolean(result);
				assert.isTrue(result);
			});
		});
	});
});
/*
TestableAddressSet
            "methodIdentifiers": {
              "add(address)": "0a3b0a4f",
              "contains(address)": "5dbe47e8",
              "element(uint256)": "f090e004",
              "getPage(uint256,uint256)": "cd1a2e91",
              "index(address)": "18def8ef",
              "remove(address)": "29092d0e",
              "size()": "949d225d"

TestableBytes32Set
            "methodIdentifiers": {
              "add(bytes32)": "446bffba",
              "contains(bytes32)": "1d1a696d",
              "element(uint256)": "f090e004",
              "getPage(uint256,uint256)": "cd1a2e91",
              "index(bytes32)": "5250fec7",
              "remove(bytes32)": "95bc2673",
              "size()": "949d225d"
            }

TestatbleProxy
            "methodIdentifiers": {
              "acceptOwnership()": "79ba5097",
              "emitSomeEvent()": "953bb133",
              "messageSender()": "d67bdd25",
              "nominateNewOwner(address)": "1627540c",
              "nominatedOwner()": "53a47bb7",
              "owner()": "8da5cb5b",
              "proxy()": "ec556889",
              "setMessageSender(address)": "bc67f832",
              "setProxy(address)": "97107d6d"
            }
 */
