import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Explore the demo/i }).click();
});

test('records, repeats, searches, and exports a workout', async ({ page }) => {
  const saveStatus = page.locator('.save-status');

  await expect(page.getByRole('heading', { name: /get to work/i })).toBeVisible();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: 'Bench press', exact: true }).click();
  await page.getByLabel('Bench press set 1 optional weight').fill('85');
  await page.getByLabel('Bench press set 1 reps').fill('8');
  await page.getByRole('button', { name: 'Complete Bench press set 1' }).click();
  await expect(page.getByText(/1\s*\/\s*3/)).toBeVisible();
  await expect(page.getByLabel('Bench press score')).toHaveText('308.4 kg');
  await expect(saveStatus).toContainText('Unsaved changes');
  await expect(saveStatus).toContainText('Saved in this browser');

  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText(/5\s*workouts logged/)).toBeVisible();
  await page.getByRole('button', { name: 'Repeat last' }).click();
  await expect(page.getByText(/0\s*\/\s*3/)).toBeVisible();
  await expect(page.getByText(/Previously: 85 lb · 8 reps/)).toBeVisible();
  await expect(saveStatus).toContainText('Saved in this browser');

  await page.getByRole('button', { name: 'History' }).click();
  await page.getByLabel('Search workout history').fill('deadlift');
  await expect(page.getByRole('heading', { name: 'No workouts to show.' })).toBeVisible();
  await page.getByLabel('Search workout history').fill('bench');
  await expect(page.getByText(/Training session/).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect((await download).suggestedFilename()).toMatch(/^setbook-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('records bodyweight reps and timed sets without weight', async ({ page }) => {
  const saveStatus = page.locator('.save-status');

  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: 'Push-up', exact: true }).click();
  await expect(page.getByLabel('Push-up set 1 optional weight')).toHaveValue('');
  await page.getByLabel('Push-up set 1 reps').fill('12');
  await page.getByRole('button', { name: 'Complete Push-up set 1' }).click();

  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: 'Plank', exact: true }).click();
  await expect(page.getByLabel('Plank tracking type')).toHaveValue('time');
  await expect(page.getByLabel('Plank set 1 optional weight')).toHaveValue('');
  await page.getByLabel('Plank set 1 seconds').fill('30');
  await page.getByRole('button', { name: 'Complete Plank set 1' }).click();

  await expect(page.getByText(/2\s*\/\s*6/)).toBeVisible();
  await expect(page.getByLabel('Push-up score')).toHaveText('12 reps');
  await expect(page.getByLabel('Plank score')).toHaveText('30 sec');
  await expect(saveStatus).toContainText('Unsaved changes');
  await expect(saveStatus).toContainText('Saved in this browser');
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText(/5\s*workouts logged/)).toBeVisible();

  await page.getByRole('button', { name: 'Repeat last' }).click();
  await expect(page.getByText(/Previously: 12 reps/)).toBeVisible();
  await expect(page.getByText(/Previously: 30 sec/)).toBeVisible();
  await expect(page.getByLabel('Push-up set 1 optional weight')).toHaveValue('');
  await expect(page.getByLabel('Plank set 1 seconds')).toHaveValue('30');
  await page.getByLabel('Push-up set 1 reps').fill('15');
  await page.getByRole('button', { name: 'Complete Push-up set 1' }).click();
  await expect(page.getByLabel('Push-up score')).toHaveText('15 reps');
  await expect(page.getByText('+25%')).toBeVisible();
});

test('keeps roles and clients isolated in the demo interface', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Clients' })).toHaveCount(0);
  await page.getByLabel('Demo role').selectOption('trainer');
  await expect(page.getByRole('button', { name: 'Clients' })).toBeVisible();
  await expect(page.getByText(/4\s*workouts logged/)).toBeVisible();
  await page.getByLabel('Select client').selectOption('demo-maya');
  await expect(page.getByRole('heading', { name: /Maya/ })).toBeVisible();
  await expect(page.getByText(/0\s*workouts logged/)).toBeVisible();
  await page.getByLabel('Demo role').selectOption('client');
  await expect(page.getByRole('button', { name: 'Clients' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Suresh/ })).toBeVisible();
});

test('keeps time-based workout entry usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: 'Plank', exact: true }).click();
  await expect(page.getByLabel('Plank tracking type')).toHaveValue('time');
  await page.getByLabel('Plank set 1 seconds').fill('30');
  await page.getByRole('button', { name: 'Complete Plank set 1' }).click();
  await expect(page.getByText(/1\s*\/\s*3/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
