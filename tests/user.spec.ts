import { Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import { Role, User } from '../src/service/pizzaService';

// In-memory backend so updates persist across logout/login without a real service
async function mockBackend(page: Page) {
  let loggedInUser: User | undefined;
  const users: User[] = [
    { id: '1', name: 'Mama Ricci', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
    { id: '4', name: 'Frank Franchisee', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Franchisee, objectId: '2' }] },
  ];
  const publicUser = (u: User) => ({ ...u, password: undefined });

  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      loggedInUser = undefined;
      await route.fulfill({ json: { message: 'logout successful' } });
      return;
    }

    const req = route.request().postDataJSON();
    if (method === 'POST') {
      loggedInUser = { id: String(users.length + 10), name: req.name, email: req.email, password: req.password, roles: [{ role: Role.Diner }] };
      users.push(loggedInUser);
      await route.fulfill({ json: { user: publicUser(loggedInUser), token: 'abcdef' } });
      return;
    }

    const user = users.find((u) => u.email === req.email && u.password === req.password);
    if (!user) {
      await route.fulfill({ status: 401, json: { message: 'unknown user' } });
      return;
    }
    loggedInUser = user;
    await route.fulfill({ json: { user: publicUser(user), token: 'abcdef' } });
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: loggedInUser ? publicUser(loggedInUser) : null });
  });

  await page.route(/\/api\/user\/\d+$/, async (route) => {
    expect(route.request().method()).toBe('PUT');
    const req = route.request().postDataJSON();
    const user = users.find((u) => u.id === req.id)!;
    user.name = req.name;
    user.email = req.email;
    if (req.password) user.password = req.password;
    await route.fulfill({ json: { user: publicUser(user), token: 'abcdef' } });
  });

  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { id: '', dinerId: '', orders: [] } });
  });
}

async function register(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Register' }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

async function editUser(page: Page, fields: { name?: string; email?: string; password?: string }) {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  if (fields.name) await page.getByRole('textbox', { name: 'name' }).fill(fields.name);
  if (fields.email) await page.getByRole('textbox', { name: 'email' }).fill(fields.email);
  if (fields.password) await page.getByRole('textbox', { name: 'password' }).fill(fields.password);
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('updateUser', async ({ page }) => {
  await register(page, 'd@jwt.com');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza diner');

  await editUser(page, { name: 'pizza dinerx' });
  await expect(page.getByRole('main')).toContainText('pizza dinerx');

  await page.getByRole('link', { name: 'Logout' }).click();
  await login(page, 'd@jwt.com', 'diner');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('update email and password', async ({ page }) => {
  await register(page, 'd@jwt.com');
  await page.getByRole('link', { name: 'pd' }).click();

  await editUser(page, { email: 'new@jwt.com', password: 'newpass' });
  await expect(page.getByRole('main')).toContainText('new@jwt.com');

  await page.getByRole('link', { name: 'Logout' }).click();
  await login(page, 'd@jwt.com', 'diner');
  await expect(page.getByRole('main')).toContainText('unknown user');

  await page.getByRole('textbox', { name: 'Email address' }).fill('new@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('newpass');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('new@jwt.com');
});

test('franchisee can update their name', async ({ page }) => {
  await page.goto('/');
  await login(page, 'f@jwt.com', 'franchisee');
  await page.getByRole('link', { name: 'FF' }).click();

  await editUser(page, { name: 'Frank Updated' });
  await expect(page.getByRole('main')).toContainText('Frank Updated');
  await expect(page.getByRole('main')).toContainText('Franchisee on 2');
});

test('admin can update their name', async ({ page }) => {
  await page.goto('/');
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'MR' }).click();

  await editUser(page, { name: 'Mama Updated' });
  await expect(page.getByRole('main')).toContainText('Mama Updated');
  await expect(page.getByRole('main')).toContainText('admin');
});
