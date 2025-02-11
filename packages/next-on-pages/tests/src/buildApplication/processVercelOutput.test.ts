import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import mockFs from 'mock-fs';
import type { ProcessedVercelOutput } from '../../../src/buildApplication/processVercelOutput';
import { processOutputDir } from '../../../src/buildApplication/processVercelOutput';
import { processVercelOutput } from '../../../src/buildApplication/processVercelOutput';
import type { PrerenderedFileData } from '../../../src/buildApplication/fixPrerenderedRoutes';
import { mockConsole } from '../../_helpers';
import { resolve } from 'path';
import { existsSync } from 'node:fs';
import { readdirSync } from 'fs';

describe('processVercelOutput', () => {
	test('should process the config and build output correctly', () => {
		const inputtedConfig: VercelConfig = {
			version: 3,
			routes: [
				{ src: '/test-1', dest: '/test-2' },
				{ src: '/use-middleware', middlewarePath: 'middleware' },
				{ handle: 'filesystem' },
				{ src: '/test-3', dest: '/test-4' },
				{ handle: 'miss' },
				{ src: '/test-2', dest: '/test-6' },
			],
		};
		const inputtedAssets = ['/static/test.png'];
		const inputtedPrerendered = new Map<string, PrerenderedFileData>();
		const inputtedFunctions = new Map<string, string>([
			['/middleware', '/middleware/index.js'],
			['/use-middleware', '/use-middleware/index.js'],
		]);

		const processed = processVercelOutput(
			inputtedConfig,
			inputtedAssets,
			inputtedPrerendered,
			inputtedFunctions,
		);

		const expected: ProcessedVercelOutput = {
			vercelConfig: {
				version: 3,
				routes: {
					none: [
						{ src: '/test-1', dest: '/test-2' },
						{ src: '/use-middleware', middlewarePath: 'middleware' },
					],
					filesystem: [{ src: '/test-3', dest: '/test-4' }],
					miss: [{ src: '/test-2', dest: '/test-6' }],
					rewrite: [],
					resource: [],
					hit: [],
					error: [],
				},
			},
			vercelOutput: new Map([
				['/static/test.png', { type: 'static' }],
				[
					'/use-middleware',
					{
						entrypoint: '/use-middleware/index.js',
						type: 'function',
					},
				],
				[
					'middleware',
					{
						entrypoint: '/middleware/index.js',
						type: 'middleware',
					},
				],
			]),
		};

		expect(processed).toEqual(expected);
	});

	test('applies overrides from the config to the outputted functions', () => {
		const inputtedConfig: VercelConfig = {
			version: 3,
			routes: [],
			overrides: {
				'404.html': { path: '404', contentType: 'text/html; charset=utf-8' },
				'500.html': { path: '500', contentType: 'text/html; charset=utf-8' },
				'index.html': {
					path: 'index',
					contentType: 'text/html; charset=utf-8',
				},
			},
		};
		const inputtedAssets = [
			'/404.html',
			'/500.html',
			'/index.html',
			'/test.html',
		];
		const inputtedPrerendered = new Map<string, PrerenderedFileData>();
		const inputtedFunctions = new Map<string, string>([
			['/page', '/page/index.js'],
		]);

		const processed = processVercelOutput(
			inputtedConfig,
			inputtedAssets,
			inputtedPrerendered,
			inputtedFunctions,
		);

		const expected: ProcessedVercelOutput = {
			vercelConfig: {
				version: 3,
				routes: {
					none: [],
					filesystem: [],
					miss: [],
					rewrite: [],
					resource: [],
					hit: [],
					error: [],
				},
				overrides: {
					'404.html': {
						contentType: 'text/html; charset=utf-8',
						path: '404',
					},
					'500.html': {
						contentType: 'text/html; charset=utf-8',
						path: '500',
					},
					'index.html': {
						contentType: 'text/html; charset=utf-8',
						path: 'index',
					},
				},
			},
			vercelOutput: new Map([
				[
					'/404.html',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/404.html',
						type: 'override',
					},
				],
				[
					'/500.html',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/500.html',
						type: 'override',
					},
				],
				[
					'/index.html',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/index.html',
						type: 'override',
					},
				],
				[
					'/test.html',
					{
						type: 'static',
					},
				],
				[
					'/page',
					{
						entrypoint: '/page/index.js',
						type: 'function',
					},
				],
				[
					'/404',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/404.html',
						type: 'override',
					},
				],
				[
					'/500',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/500.html',
						type: 'override',
					},
				],
				[
					'/index',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/index.html',
						type: 'override',
					},
				],
				[
					'/',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/index.html',
						type: 'override',
					},
				],
			]),
		};

		expect(processed).toEqual(expected);
	});

	test('applies prerendered routes to the outputted functions', () => {
		const inputtedConfig: VercelConfig = {
			version: 3,
			routes: [],
			overrides: {
				'404.html': { path: '404', contentType: 'text/html; charset=utf-8' },
				'500.html': { path: '500', contentType: 'text/html; charset=utf-8' },
				'index.html': {
					path: 'index',
					contentType: 'text/html; charset=utf-8',
				},
			},
		};
		const inputtedAssets = [
			'/404.html',
			'/500.html',
			'/index.html',
			'/index.rsc',
			'/nested/(route-group)/foo.html',
		];
		const inputtedPrerendered = new Map<string, PrerenderedFileData>([
			[
				'/index.html',
				{
					headers: {
						vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
					},
					overrides: ['/index', '/'],
				},
			],
			[
				'/index.rsc',
				{
					headers: {
						'content-type': 'text/x-component',
						vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
					},
					overrides: [],
				},
			],
			[
				'/nested/(route-group)/foo.html',
				{
					headers: {
						vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
					},
					overrides: ['/nested/foo.html', '/nested/foo'],
				},
			],
		]);
		const inputtedFunctions = new Map<string, string>([
			['/page', '/page/index.js'],
		]);

		const processed = processVercelOutput(
			inputtedConfig,
			inputtedAssets,
			inputtedPrerendered,
			inputtedFunctions,
		);

		const expected: ProcessedVercelOutput = {
			vercelConfig: {
				version: 3,
				routes: {
					none: [],
					filesystem: [],
					miss: [],
					rewrite: [],
					resource: [],
					hit: [],
					error: [],
				},
				overrides: {
					'404.html': {
						contentType: 'text/html; charset=utf-8',
						path: '404',
					},
					'500.html': {
						contentType: 'text/html; charset=utf-8',
						path: '500',
					},
					'index.html': {
						contentType: 'text/html; charset=utf-8',
						path: 'index',
					},
				},
			},
			vercelOutput: new Map<string, BuildOutputItem>([
				[
					'/404.html',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/404.html',
						type: 'override',
					},
				],
				[
					'/500.html',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/500.html',
						type: 'override',
					},
				],
				[
					'/index.html',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/index.html',
						type: 'override',
					},
				],
				[
					'/index.rsc',
					{
						headers: {
							'content-type': 'text/x-component',
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/index.rsc',
						type: 'override',
					},
				],
				[
					'/nested/(route-group)/foo.html',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/nested/(route-group)/foo.html',
						type: 'override',
					},
				],
				[
					'/page',
					{
						entrypoint: '/page/index.js',
						type: 'function',
					},
				],
				[
					'/404',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/404.html',
						type: 'override',
					},
				],
				[
					'/500',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
						path: '/500.html',
						type: 'override',
					},
				],
				[
					'/index',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/index.html',
						type: 'override',
					},
				],
				[
					'/',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/index.html',
						type: 'override',
					},
				],
				[
					'/nested/foo.html',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/nested/(route-group)/foo.html',
						type: 'override',
					},
				],
				[
					'/nested/foo',
					{
						headers: {
							vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
						},
						path: '/nested/(route-group)/foo.html',
						type: 'override',
					},
				],
			]),
		};

		expect(processed).toEqual(expected);
	});
});

describe('processOutputDir', () => {
	beforeEach(() => {
		mockFs({
			'.vercel': {
				output: {
					static: {
						'index.js': 'console.log("hello world")',
						nested: { 'index.html': '<html>Hello world</html>' },
					},
				},
			},
			existing: { 'file.txt': 'hello world' },
		});
	});

	afterEach(() => mockFs.restore());

	const vercelDir = resolve('.vercel', 'output', 'static');

	test('default vercel output dir gets handled normally', async () => {
		const staticAssets = ['index.js', 'nested/index.html'];
		const outputDir = vercelDir;

		expect(readdirSync(outputDir)).toEqual(['index.js', 'nested']);
		expect(existsSync(outputDir)).toEqual(true);
		await processOutputDir(outputDir, staticAssets);
		expect(readdirSync(outputDir)).toEqual(['index.js', 'nested']);
	});

	test('custom output dir copies files successfully', async () => {
		const staticAssets = ['index.js', 'nested/index.html'];
		const outputDir = resolve('custom');

		const mockedConsole = mockConsole('log');

		expect(readdirSync(vercelDir)).toEqual(['index.js', 'nested']);
		expect(existsSync(outputDir)).toEqual(false);
		await processOutputDir(outputDir, staticAssets);
		expect(readdirSync(vercelDir)).toEqual(['index.js', 'nested']);
		expect(readdirSync(outputDir)).toEqual(['index.js', 'nested']);

		mockedConsole.expectCalls([
			/output directory: custom/,
			/Copying 2 static assets/,
		]);
		mockedConsole.restore();
	});

	test('custom existing output dir clears directory then copies files', async () => {
		const staticAssets = ['index.js', 'nested/index.html'];
		const outputDir = resolve('existing');

		const mockedConsole = mockConsole('log');

		expect(readdirSync(vercelDir)).toEqual(['index.js', 'nested']);
		expect(readdirSync(outputDir)).toEqual(['file.txt']);
		await processOutputDir(outputDir, staticAssets);
		expect(readdirSync(vercelDir)).toEqual(['index.js', 'nested']);
		expect(readdirSync(outputDir)).toEqual(['index.js', 'nested']);

		mockedConsole.expectCalls([
			/output directory: existing/,
			/Copying 2 static assets/,
		]);
		mockedConsole.restore();
	});
});
