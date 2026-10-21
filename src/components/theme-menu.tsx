'use client';

import { useState } from 'react';
import { ThemeSwitcher } from '@/components/theme-switcher';

// A small button on every page that opens the appearance choices: Standard or
// colour-blind friendly, and Auto, Light or Dark. The choice is kept on the device.
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 50 }}>
      {open && (
        <div className="card" style={{ marginBottom: 8, padding: 12, maxWidth: 300 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Appearance</div>
          <ThemeSwitcher />
        </div>
      )}
      <button
        type="button"
        className="btn-ghost"
        aria-expanded={open}
        aria-label="Change appearance: light, dark or colour-blind friendly"
        onClick={() => setOpen((o) => !o)}
        style={{ width: 'auto', minHeight: 36, padding: '6px 12px', borderRadius: 999, background: 'var(--surface, var(--bg))', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}
      >
        🎨 Theme
      </button>
    </div>
  );
}
