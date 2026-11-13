import { test, expect } from '@playwright/test';

const SERVICE = process.env.SERVICE_URL ?? 'https://pizza-service.deck-network.com';
const SITE = process.env.SITE_URL ?? 'https://pizza.deck-network.com';
const MAX_MS = 2000; // latency budget per call

test('frontend is up and reports a version', async ({ request }) => {
  const res = await request.get(`${SITE}/version.json`);
  expect(res.status()).toBe(200);
  expect((await res.json()).version).toMatch(/^\d{8}\.\d{6}$/);
});

test('service root responds', async ({ request }) => {
  const res = await request.get(SERVICE);
  expect(res.status()).toBe(200);
  expect(await res.json()).toHaveProperty('version');
});

test('menu has pizzas with title and price', async ({ request }) => {
  const start = Date.now();
  const res = await request.get(`${SERVICE}/api/order/menu`);
  expect(Date.now() - start).toBeLessThan(MAX_MS);
  expect(res.status()).toBe(200);
  const menu = await res.json();
  expect(menu.length).toBeGreaterThan(0);
  for (const p of menu) {
    expect(typeof p.title).toBe('string');
    expect(typeof p.price).toBe('number');
  }
});

test('franchise list has at least one store', async ({ request }) => {
  const res = await request.get(`${SERVICE}/api/franchise?limit=10`);
  expect(res.status()).toBe(200);
  const { franchises } = await res.json();
  expect(franchises.some((f: any) => f.stores.length > 0)).toBe(true);
});

test('login -> me -> logout', async ({ request }) => {
  const email = process.env.SYNTHETIC_EMAIL, password = process.env.SYNTHETIC_PASSWORD;
  test.skip(!email || !password, 'SYNTHETIC_EMAIL / SYNTHETIC_PASSWORD not set');

  const login = await request.put(`${SERVICE}/api/auth`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };

  const me = await request.get(`${SERVICE}/api/user/me`, { headers });
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(email);

  expect((await request.delete(`${SERVICE}/api/auth`, { headers })).status()).toBe(200);
});
