import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('Schema Validation via Swagger / OpenAPI', () => {
	describe('Existing APIs - shape validation', () => {
		it('POST /api/auth/register returns the expected error schema', async () => {
			const res = await SELF.fetch('http://localhost/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const json = await res.json();
			// Validates ErrorResponse schema from openapi.yaml
			expect(res.status).toBe(400);
			expect(json).toHaveProperty('error');
			expect(typeof json.error).toBe('string');
		});

		it('POST /api/ai/suggest returns the expected response schema', async () => {
			const res = await SELF.fetch('http://localhost/api/ai/suggest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ description: 'Fix login bug' })
			});

			const json = await res.json();
			// Validates AiSuggestResponse schema
			expect(res.status).toBe(200);
			expect(json).toHaveProperty('suggestion');
			expect(typeof json.suggestion).toBe('string');
		});
	});

	describe('Payment Mock API (non-existing real backend) - contract-first validation', () => {
		it('POST /api/payments returns a valid Payment schema', async () => {
			const res = await SELF.fetch('http://localhost/api/payments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: 99.99,
					currency: 'USD',
					orderId: 'ORD-TEST-001',
					customerEmail: 'test@example.com'
				})
			});

			const json = await res.json();
			// Validates Payment schema from openapi.yaml
			expect(res.status).toBe(200);
			expect(json).toHaveProperty('paymentId');
			expect(json.paymentId).toMatch(/^PAY-[a-f0-9-]+$/);
			expect(json).toHaveProperty('status', 'PENDING');
			expect(json).toHaveProperty('amount', 99.99);
			expect(json).toHaveProperty('currency', 'USD');
			expect(json).toHaveProperty('orderId', 'ORD-TEST-001');
			expect(json).toHaveProperty('createdAt');
			expect(json).toHaveProperty('confirmedAt', null);
			expect(new Date(json.createdAt).toISOString()).toBe(json.createdAt);
		});

		it('POST /api/payments rejects missing required fields', async () => {
			const res = await SELF.fetch('http://localhost/api/payments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: 10 })
			});

			const json = await res.json();
			expect(res.status).toBe(400);
			expect(json).toHaveProperty('error');
		});

		it('GET /api/payments/:id returns a valid Payment schema', async () => {
			// 1. Create mock payment
			const createRes = await SELF.fetch('http://localhost/api/payments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: 50.0,
					currency: 'EUR',
					orderId: 'ORD-TEST-002'
				})
			});
			const { paymentId } = await createRes.json();

			// 2. Retrieve it
			const getRes = await SELF.fetch(`http://localhost/api/payments/${paymentId}`);
			const json = await getRes.json();

			expect(getRes.status).toBe(200);
			expect(json.paymentId).toBe(paymentId);
			expect(json.status).toBe('PENDING');
			expect(json).toHaveProperty('amount');
			expect(json).toHaveProperty('currency');
			expect(json).toHaveProperty('createdAt');
		});

		it('POST /api/payments/:id/confirm transitions status to CONFIRMED', async () => {
			// 1. Create mock payment
			const createRes = await SELF.fetch('http://localhost/api/payments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: 10.0,
					currency: 'GBP',
					orderId: 'ORD-TEST-003'
				})
			});
			const { paymentId } = await createRes.json();

			// 2. Confirm it
			const confirmRes = await SELF.fetch(
				`http://localhost/api/payments/${paymentId}/confirm`,
				{ method: 'POST' }
			);
			const json = await confirmRes.json();

			// Validates Payment schema with updated status
			expect(confirmRes.status).toBe(200);
			expect(json.status).toBe('CONFIRMED');
			expect(json.confirmedAt).toBeTruthy();
			expect(new Date(json.confirmedAt).toISOString()).toBe(json.confirmedAt);
		});

		it('POST /api/payments/:id/confirm returns 409 if already confirmed', async () => {
			const createRes = await SELF.fetch('http://localhost/api/payments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: 5.0,
					currency: 'USD',
					orderId: 'ORD-TEST-004'
				})
			});
			const { paymentId } = await createRes.json();

			// Confirm twice
			await SELF.fetch(`http://localhost/api/payments/${paymentId}/confirm`, {
				method: 'POST'
			});
			const second = await SELF.fetch(
				`http://localhost/api/payments/${paymentId}/confirm`,
				{ method: 'POST' }
			);
			const json = await second.json();

			expect(second.status).toBe(409);
			expect(json).toHaveProperty('error');
		});

		it('GET /api/payments/:id returns 404 for unknown payment', async () => {
			const res = await SELF.fetch('http://localhost/api/payments/PAY-unknown-id-123');
			const json = await res.json();
			expect(res.status).toBe(404);
			expect(json).toHaveProperty('error');
		});
	});
});
