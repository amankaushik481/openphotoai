import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("login page renders an email sign-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test("/app redirects signed-out visitors to /login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
