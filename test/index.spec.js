import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Edge TaskFlow App', () => {
	describe('Root redirect', () => {
		it('redirects / to /login.html', async () => {
			const request = new Request('http://example.com/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toMatch(/\/login\.html$/);
		});
	});

	describe('API Docs redirect', () => {
		it('redirects /docs to /swagger-ui.html', async () => {
			const request = new Request('http://example.com/docs');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toMatch(/\/swagger-ui\.html$/);
		});
	});

	describe('Auth endpoints', () => {
		it('POST /api/auth/register validates required fields', async () => {
			const request = new Request('http://example.com/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const response = await SELF.fetch(request);
			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json).toHaveProperty('error');
		});

		it('POST /api/auth/login validates required fields', async () => {
			const request = new Request('http://example.com/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const response = await SELF.fetch(request);
			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json).toHaveProperty('error');
		});
	});

	describe('Payment Mock endpoints', () => {
		it('GET /api/payments/:id returns 404 for unknown payment', async () => {
			const request = new Request('http://example.com/api/payments/PAY-unknown');
			const response = await SELF.fetch(request);
			expect(response.status).toBe(404);
		});
	});
});
