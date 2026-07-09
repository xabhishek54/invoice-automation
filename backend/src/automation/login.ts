import { Page } from 'playwright';
import { SELECTORS } from './selectors';
import { AutomationLogger } from './logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // Fetch credentials from DB settings
  const usernameSetting = await prisma.setting.findUnique({ where: { key: 'portal_username' } });
  const passwordSetting = await prisma.setting.findUnique({ where: { key: 'portal_password' } });
  
  const username = usernameSetting?.value;
  const password = passwordSetting?.value;

  if (!username || !password) {
    logger.error('Khatacloud login email and password are not configured in settings.');
    throw new Error('Khatacloud login credentials are not configured. Please set them in settings.');
  }

  const loginUrlSetting = await prisma.setting.findUnique({ where: { key: 'portal_login_url' } });
  const loginUrl = loginUrlSetting?.value || SELECTORS.login.url;

  logger.info(`Navigating to login page: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'load' });

  logger.info('Filling login credentials...');
  await page.fill(SELECTORS.login.usernameInput, username);
  await page.fill(SELECTORS.login.passwordInput, password);
  
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
