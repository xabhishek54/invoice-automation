import { chromium, Browser, BrowserContext } from 'playwright';

class IrdScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  
  // Mutex lock to serialize queries
  private isBusy = false;
  private queue: (() => void)[] = [];

  private async acquireLock() {
    if (!this.isBusy) {
      this.isBusy = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseLock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.isBusy = false;
    }
  }

  async init() {
    if (!this.browser) {
      console.log('[IrdScraper] Launching background Chromium browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.context = await this.browser.newContext();
      
      // Block CSS, images, fonts, and media to minimize page load time
      await this.context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          return route.abort();
        }
        return route.continue();
      });
    }
  }

  async verifyPan(pan: string): Promise<any> {
    await this.acquireLock();
    try {
      await this.init();
      
      // Spawns a clean page in the existing browser context to prevent reCAPTCHA tracking/blocks
      const page = await this.context!.newPage();
      try {
        console.log(`[IrdScraper] Navigating to PAN search for ${pan}...`);
        await page.goto('https://ird.gov.np/pan-search', { timeout: 20000 });
        await page.waitForSelector('#pan', { timeout: 10000 });

        console.log(`[IrdScraper] Filling PAN: ${pan}`);
        await page.fill('#pan', pan);

        console.log('[IrdScraper] Setting up response interceptor...');
        const responsePromise = page.waitForResponse(
          response => response.url().includes('/api/getPanSearch/'),
          { timeout: 15000 }
        );

        console.log('[IrdScraper] Clicking Search button...');
        await page.click('#submit');

        console.log('[IrdScraper] Waiting for API response...');
        const response = await responsePromise;
        const status = response.status();
        
        let json: any = {};
        try {
          json = await response.json();
        } catch (e) {
          console.warn(`[IrdScraper] Failed to parse response JSON: ${(e as Error).message}`);
        }

        console.log(`[IrdScraper] API response received with status: ${status}`);
        if (status !== 200) {
          console.log(`[IrdScraper] PAN ${pan} verification returned status ${status} (Invalid/Not Found).`);
          return { code: 0, message: json.message || 'PAN not found' };
        }

        console.log(`[IrdScraper] Successfully verified PAN: ${pan}`);
        return json;
      } finally {
        await page.close().catch(() => {});
      }
    } catch (err) {
      console.warn(`[IrdScraper] Playwright browser error: ${(err as Error).message}.`);
      throw err;
    } finally {
      this.releaseLock();
    }
  }

  async close() {
    await this.acquireLock();
    try {
      if (this.browser) {
        console.log('[IrdScraper] Closing Chromium browser...');
        await this.browser.close();
        this.browser = null;
        this.context = null;
      }
    } finally {
      this.releaseLock();
    }
  }
}

export const irdScraper = new IrdScraper();
