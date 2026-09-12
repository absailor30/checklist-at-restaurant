'use client';

import { useEffect, useState } from 'react';

// Appearance is a per-device choice, stored on the device. On a shared tablet
// it belongs to the tablet, not to whoever is signed in at the time.

type Theme = 'default' | 'cvd';
type Scheme = 'auto' | 'light' | 'dark';

export const THEME_KEY = 'checklist.theme';
export const SCHEME_KEY = 'checklist.scheme';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>('default');
  const [scheme, setScheme] = useState<Scheme>('auto');

  useEffect(() => {
    try {
      setTheme((localStorage.getItem(THEME_KEY) as Theme) ?? 'default');
      setScheme((localStorage.getItem(SCHEME_KEY) as Scheme) ?? 'auto');
    } catch {
      // Private browsing can refuse storage. The default appearance still works.
    }
  }, []);

  function apply(nextTheme: Theme, nextScheme: Scheme) {
    setTheme(nextTheme);
    setScheme(nextScheme);
    const root = document.documentElement;

    if (nextTheme === 'default') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', nextTheme);

    if (nextScheme === 'auto') root.removeAttribute('data-scheme');
    else root.setAttribute('data-scheme', nextScheme);

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
      localStorage.setItem(SCHEME_KEY, nextScheme);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }

  return (
    <div>
      <div className="themebar" role="group" aria-label="Colours">
        <button className={theme === 'default' ? 'on' : ''}
          onClick={() => apply('default', scheme)}>
          Standard
        </button>
        <button className={theme === 'cvd' ? 'on' : ''}
          onClick={() => apply('cvd', scheme)}>
          Colour-blind friendly
        </button>
      </div>
      <div className="themebar" role="group" aria-label="Light or dark">
        <button className={scheme === 'auto' ? 'on' : ''}
          onClick={() => apply(theme, 'auto')}>Auto</button>
        <button className={scheme === 'light' ? 'on' : ''}
          onClick={() => apply(theme, 'light')}>Light</button>
        <button className={scheme === 'dark' ? 'on' : ''}
          onClick={() => apply(theme, 'dark')}>Dark</button>
      </div>
    </div>
  );
}

// Applied before the first paint, so a chosen theme does not flash the default
// one on every page load.
export const themeBootScript = `
(function () {
  try {
    var t = localStorage.getItem('${THEME_KEY}');
    var s = localStorage.getItem('${SCHEME_KEY}');
    if (t && t !== 'default') document.documentElement.setAttribute('data-theme', t);
    if (s && s !== 'auto') document.documentElement.setAttribute('data-scheme', s);
  } catch (e) {}
})();
`;
