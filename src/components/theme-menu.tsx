'use client';

import { useState } from 'react';
import { ThemeSwitcher } from '@/components/theme-switcher';

// A slim strip at the very top of every page with one button that opens the appearance
// choices: Standard or colour-blind friendly, and Auto, Light or Dark. The choice is kept
// on the device.
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0', zIndex: 50 }}>
      <button
        type="button"
        className="btn-ghost"
        aria-expanded={open}
        aria-label="Change appearance: light, dark or colour-blind friendly"
        onClick={() => setOpen((o) => !o)}
        style={{ width: 'auto', minHeight: 32, padding: '4px 12px', borderRadius: 999, fontSize: 13 }}
      >
        🎨 Theme
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: '100%', right: 12, marginTop: 6, padding: 12, width: 'min(300px, calc(100vw - 24px))', boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Appearance</div>
          <ThemeSwitcher />
        </div>
      )}
    </div>
  );
}
