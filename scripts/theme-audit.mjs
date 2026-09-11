/**
 * Screenshots every component in light and dark mode and reports any text that
 * fails WCAG AA contrast against what is actually behind it.
 *
 * Written because "dark text on a dark background" is invisible to a developer
 * who only ever looks in one mode, and because eyeballing contrast is guesswork
 * when the answer is computable.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const fixture = pathToFileURL(path.resolve('scripts/theme-fixture.html')).href;
const out = process.argv[2] ?? '/tmp/theme';

const audit = () => {
  const toRgb = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map((n) => parseFloat(n));
    return { r, g, b, a: a === undefined ? 1 : a };
  };

  // Walk up for the first non-transparent background — that is what the text
  // is really sitting on.
  const backgroundOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = toRgb(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.95) return bg;
      node = node.parentElement;
    }
    return toRgb(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
  };

  const luminance = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const failures = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!text) continue;

    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    const fg = toRgb(style.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = backgroundOf(el);
    const r = ratio(fg, bg);

    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    // WCAG AA: 3:1 for large text, 4.5:1 otherwise.
    const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;

    if (r < required) {
      failures.push({
        text: text.slice(0, 48),
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''),
        color: style.color,
        background: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        ratio: Math.round(r * 100) / 100,
        required,
      });
    }
  }
  return failures;
};

// The bundled browser is pinned to this environment's build, not the one
// this Playwright version expects, so point at it explicitly.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const report = {};

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 430, height: 2400 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(fixture);
  await page.waitForTimeout(300);

  report[scheme] = await page.evaluate(audit);
  await page.screenshot({ path: `${out}-${scheme}.png`, fullPage: true });
  await context.close();
}

await browser.close();

for (const scheme of ['light', 'dark']) {
  const fails = report[scheme];
  console.log(`\n=== ${scheme.toUpperCase()} — ${fails.length} contrast failures ===`);
  for (const f of fails) {
    console.log(`  ${f.ratio}:1 (needs ${f.required}) ${f.selector}`);
    console.log(`      "${f.text}"  ${f.color} on ${f.background}`);
  }
}

const total = report.light.length + report.dark.length;
console.log(`\nTOTAL FAILURES: ${total}`);
