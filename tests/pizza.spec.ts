import { Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import { Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
    'a@jwt.com': { id: '1', name: 'Mama Ricci', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
    'f@jwt.com': { id: '4', name: 'Frank Franchisee', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Franchisee, objectId: '2' }] },
  };

  // Authorize login/register/logout for the given user
  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      loggedInUser = undefined;
      await route.fulfill({ json: { message: 'logout successful' } });
      return;
    }

    const req = route.request().postDataJSON();
    if (method === 'POST') {
      loggedInUser = { id: '5', name: req.name, email: req.email, roles: [{ role: Role.Diner }] };
      await route.fulfill({ json: { user: loggedInUser, token: 'abcdef' } });
      return;
    }

    const user = validUsers[req.email];
    if (!user || user.password !== req.password) {
      await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
      return;
    }
    loggedInUser = user;
    expect(method).toBe('PUT');
    await route.fulfill({ json: { user: loggedInUser, token: 'abcdef' } });
  });

  // Return the currently logged in user
  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  // A standard menu
  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  // Franchise collection: list (with paging/filter) or create
  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const franchiseRes = {
      franchises: [
        { id: 2, name: 'LotaPizza', stores: [{ id: 4, name: 'Lehi' }, { id: 5, name: 'Springville' }, { id: 6, name: 'American Fork' }] },
        { id: 3, name: 'PizzaCorp', stores: [{ id: 7, name: 'Spanish Fork' }] },
        { id: 4, name: 'topSpot', stores: [] },
      ],
      more: false,
    };
    if (route.request().method() === 'POST') {
      const req = route.request().postDataJSON();
      await route.fulfill({ json: { ...req, id: 5 } });
      return;
    }
    await route.fulfill({ json: franchiseRes });
  });

  // A single franchise: the diner/franchisee's own franchise (GET), or admin closing it (DELETE)
  await page.route(/\/api\/franchise\/[^/?]+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'franchise deleted' } });
      return;
    }
    const franchiseRes = [
      { id: 2, name: 'LotaPizza', stores: [{ id: 4, name: 'Lehi', totalRevenue: 0.05 }, { id: 5, name: 'Springville', totalRevenue: 0.02 }] },
    ];
    await route.fulfill({ json: franchiseRes });
  });

  // Create a store
  await page.route(/\/api\/franchise\/[^/?]+\/store$/, async (route) => {
    const req = route.request().postDataJSON();
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: { ...req, id: 8 } });
  });

  // Close a store
  await page.route(/\/api\/franchise\/[^/?]+\/store\/[^/?]+$/, async (route) => {
    expect(route.request().method()).toBe('DELETE');
    await route.fulfill({ json: { message: 'store deleted' } });
  });

  // Order history (GET) and order placement (POST)
  await page.route('*/**/api/order', async (route) => {
    if (route.request().method() === 'GET') {
      const orderHistoryRes = {
        id: '3',
        dinerId: '3',
        orders: [{ id: '20', franchiseId: '2', storeId: '4', date: '2024-06-01T12:00:00Z', items: [{ menuId: '1', description: 'Veggie', price: 0.0038 }] }],
      };
      await route.fulfill({ json: orderHistoryRes });
      return;
    }
    const orderReq = route.request().postDataJSON();
    const orderRes = { order: { ...orderReq, id: 23 }, jwt: 'eyJpYXQ' };
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: orderRes });
  });

  // Verify the delivered JWT with the pizza factory
  await page.route('*/**/api/order/verify', async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: { message: 'valid', payload: { pizza: 'valid' } } });
  });

  // API docs
  await page.route('*/**/api/docs', async (route) => {
    const docsRes = {
      endpoints: [{ method: 'GET', path: '/api/order/menu', requiresAuth: false, description: 'Get the menu', example: `curl localhost:3000/api/order/menu`, response: [{ id: 1, title: 'Veggie' }] }],
    };
    await route.fulfill({ json: docsRes });
  });

  await page.goto('/');
}

test('home page', async ({ page }) => {
  await basicInit(page);

  expect(await page.title()).toBe('JWT Pizza');
});

test('static pages', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('h2')).toContainText('Mama Rucci');

  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.locator('h2').first()).toContainText('The secret sauce');

  await page.goto('/no-such-page');
  await expect(page.locator('h2')).toContainText('Oops');

  await page.goto('/docs');
  await expect(page.locator('h2').first()).toContainText('JWT Pizza API');
  await expect(page.getByText('/api/order/menu').first()).toBeVisible();
});

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('login with bad password shows an error', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByText('Unauthorized')).toBeVisible();
});

test('register and logout', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByPlaceholder('Full name').fill('Pizza Newbie');
  await page.getByPlaceholder('Email address').fill('new@jwt.com');
  await page.getByPlaceholder('Password').fill('newpass');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByRole('link', { name: 'PN' })).toBeVisible();

  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});

test('diner dashboard shows order history', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'KC' }).click();
  await expect(page.locator('h2')).toContainText('Your pizza kitchen');
  await expect(page.getByText('Kai Chen')).toBeVisible();
  await expect(page.locator('tbody')).toContainText('20');
});

test('admin can create and close a franchise', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.locator('h2')).toContainText("Mama Ricci's kitchen");
  await expect(page.getByRole('table')).toContainText('LotaPizza');

  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await expect(page.locator('h2')).toContainText('Create franchise');
  await page.getByPlaceholder('franchise name').fill('New Franchise');
  await page.getByPlaceholder('franchisee admin email').fill('owner@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('h2')).toContainText("Mama Ricci's kitchen");

  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('h2')).toContainText('Sorry to see you go');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('h2')).toContainText("Mama Ricci's kitchen");
});

test('franchisee can create and close a store', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchisee');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Franchise' }).click();
  await expect(page.locator('h2').first()).toContainText('LotaPizza');
  await expect(page.getByRole('table')).toContainText('Lehi');

  await page.getByRole('button', { name: 'Create store' }).click();
  await expect(page.locator('h2')).toContainText('Create store');
  await page.getByPlaceholder('store name').fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('h2').first()).toContainText('LotaPizza');

  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('h2')).toContainText('Sorry to see you go');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('h2').first()).toContainText('LotaPizza');
});

test('purchase with login', async ({ page }) => {
  await basicInit(page);

  // Go to order page
  await page.getByRole('button', { name: 'Order now' }).click();

  // Create order
  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  // Login
  await page.getByPlaceholder('Email address').click();
  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Email address').press('Tab');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  // Pay
  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  // Check balance and verify the delivered JWT
  await expect(page.getByText('0.008')).toBeVisible();
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('JWT Pizza - valid')).toBeVisible();
});
