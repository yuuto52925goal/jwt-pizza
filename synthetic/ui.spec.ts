import { test, expect } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
});

test('menu page loads pizzas from the real service', async ({ page }) => {
  await page.goto('/menu');
  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await expect(page.getByRole('link', { name: /Veggie/ })).toBeVisible();
});

// The core business flow: a real user buying a pizza end to end.
test('login, order, pay, verify JWT', async ({ page }) => {
  const email = process.env.SYNTHETIC_EMAIL, password = process.env.SYNTHETIC_PASSWORD;
  test.skip(!email || !password, 'SYNTHETIC_EMAIL / SYNTHETIC_PASSWORD not set');

  await page.goto('/menu');
  await page.getByRole('combobox').selectOption({ index: 1 }); // first real store (index 0 is the placeholder)
  await page.getByRole('link', { name: /Veggie/ }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 1');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.locator('tbody')).toContainText('Veggie');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('JWT Pizza - valid')).toBeVisible();
});
