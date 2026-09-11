/**
 * Screenshots the real routes in both themes. The fixture covers components;
 * this covers the pages as they actually assemble, including their loading and
 * empty states.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3114';
const routes = ['/staff', '/manager', '/owner', '/onboard', '/manage', '/setup', '/health'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 430, height: 900 },
  });
  for (const route of routes) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      // An API that cannot reach its database still renders the page shell,
      // which is what is being inspected here.
    }
    await page.waitForTimeout(600);
    const name = route.replace('/', '') || 'home';
    await page.screenshot({ path: `/tmp/page-${name}-${scheme}.png`, fullPage: true });
    console.log(`${scheme.padEnd(5)} ${route.padEnd(10)} ${errors.length ? 'JS ERROR: ' + errors[0].slice(0, 70) : 'ok'}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
