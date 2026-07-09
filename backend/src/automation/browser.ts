import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { AutomationLogger } from './logger';

export class BrowserService {
  private static instance: BrowserService;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  public async startBrowser(logger: AutomationLogger): Promise<void> {
    if (this.browser) {
      logger.info('Browser already running, reusing instance.');
      return;
    }

    const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    logger.info(`Launching browser (headless = ${headless})...`);

    try {
      this.browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      
      this.page = await this.context.newPage();
      logger.info('Browser launched successfully.');
    } catch (e: any) {
      logger.error(`Failed to launch browser: ${e.message}`);
      await this.closeBrowser(logger);
      throw e;
    }
  }

  public async getPage(logger: AutomationLogger): Promise<Page> {
    if (!this.page) {
      logger.info('Browser page not initialized. Starting browser now...');
      await this.startBrowser(logger);
    }
    return this.page!;
  }

  public async closeBrowser(logger: AutomationLogger): Promise<void> {
    logger.info('Closing browser instance...');
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      logger.info('Browser closed successfully.');
    } catch (e: any) {
      logger.error(`Error during browser close: ${e.message}`);
    }
  }

  public isBrowserRunning(): boolean {
    return this.browser !== null;
  }
}
