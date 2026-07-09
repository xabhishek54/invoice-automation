import { Page } from 'playwright';
import { SELECTORS } from './selectors';
import { AutomationLogger } from './logger';

export async function loginToPortal(page: Page, logger: AutomationLogger): Promise<void> {
  logger.info('Checking session status...');
  
  const currentUrl = page.url();
  
  // If we are already on the transaction entry page and the dashboard indicator exists, skip login
  if (currentUrl.includes('/Home/entry')) {
    const isLoggedIn = await page.$(SELECTORS.login.dashboardIndicator).then(el => !!el).catch(() => false);
    if (isLoggedIn) {
      logger.info('Already logged in, reusing session.');
      return;
    }
  }

  logger.info(`Navigating to login page: ${SELECTORS.login.url}`);
  await page.goto(SELECTORS.login.url, { waitUntil: 'load' });

  logger.info('Filling login credentials...');
  // Fill Username and Password (both are rajesh.raja99@gmail.com)
  await page.fill(SELECTORS.login.usernameInput, 'rajesh.raja99@gmail.com');
  await page.fill(SELECTORS.login.passwordInput, 'rajesh.raja99@gmail.com');
  
  logger.info('Submitting login form...');
  await Promise.all([
    page.click(SELECTORS.login.loginButton),
    page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {})
  ]);

  // Verify successful login by checking for the dashboard indicator or if we are redirected to Home/Dashboard/Entry
  const isRedirected = page.url().includes('/Home/') || await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: 8000 })
    .then(el => !!el)
    .catch(() => false);

  if (!isRedirected) {
    logger.error('Login failed! Dashboard indicator not found and not redirected.');
    throw new Error('Failed to log in to the Khatacloud portal.');
  }

  logger.info('Login successful.');
}
