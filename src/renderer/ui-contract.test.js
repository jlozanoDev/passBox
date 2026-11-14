/**
 * Renderer contract tests (S15).
 *
 * These encode the spec lines that are easy to break silently: Spanish copy,
 * secret handling, the responsive navigation breakpoints, 44px touch targets,
 * dialog focus return and the art-direction rules from S14. They read the
 * source (there is no component-mount harness in this project), so a change
 * that violates a spec turns them red.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rendererRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(rendererRoot, '..', '..');
const read = (path) => readFileSync(path, 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    // The tests themselves quote forbidden strings; they are not app source.
    else if (/\.(vue|js|css)$/.test(entry) && !entry.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const sources = new Map(walk(rendererRoot).map((file) => [file, read(file)]));
const vueFiles = [...sources.keys()].filter((file) => file.endsWith('.vue'));
const rel = (file) => relative(rendererRoot, file);
const src = (relPath) => sources.get(join(rendererRoot, relPath));

// Tailwind v4 --spacing: 0.25rem, so size-11 = 44px.
const PX_PER_UNIT = 4;

function isMobileApplicable(variant) {
  if (!variant) return true; // no variant: applies at every width
  if (variant.startsWith('max-')) return true; // max-* applies on small screens
  return false; // sm:/md:/lg:… apply from a breakpoint up (pointer layouts)
}

function mobileSizeViolations(classAttr) {
  const violations = [];
  for (const token of classAttr.split(/\s+/).filter(Boolean)) {
    const match = token.match(
      /^(?:([\w-]+):)?(?:size|h|w)-(\d+(?:\.\d+)?)(?:px)?$/,
    );
    if (!match) continue;
    const [, variant, value] = match;
    if (!isMobileApplicable(variant)) continue;
    const px = value.includes('.')
      ? Number(value)
      : Number(value) * PX_PER_UNIT;
    if (px < 44) violations.push(token);
  }
  return violations;
}

describe('S13 — Spanish UI', () => {
  it('declares lang="es"', () => {
    expect(read(join(repoRoot, 'index.html'))).toMatch(/<html\s+lang="es"/);
  });

  it('keeps the four validation strings verbatim', () => {
    const unlock = src('components/UnlockScreen.vue');
    for (const phrase of [
      'La contraseña maestra debe tener al menos 8 caracteres.',
      'Las contraseñas no coinciden.',
      'Introduce tu contraseña maestra.',
      'Contraseña maestra incorrecta.',
    ]) {
      expect(unlock).toContain(phrase);
    }
  });

  it('has no legacy English validation string left anywhere', () => {
    const legacy = [
      'Master password must be at least 8 characters.',
      'Passwords do not match.',
      'Enter your master password.',
      'Wrong master password.',
      "'Untitled'",
    ];
    for (const [file, text] of sources) {
      for (const phrase of legacy) {
        expect(text, `${rel(file)}: ${phrase}`).not.toContain(phrase);
      }
    }
  });
});

describe('S10 — secret safety', () => {
  it('never logs from the renderer', () => {
    for (const [file, text] of sources) {
      expect(text, rel(file)).not.toMatch(
        /console\.(log|warn|error|info|debug)\s*\(/,
      );
    }
  });

  it('stores nothing but the theme preference in localStorage', () => {
    const users = [...sources.entries()]
      .filter(([, text]) => text.includes('localStorage'))
      .map(([file]) => rel(file));
    expect(users).toEqual([join('composables', 'useTheme.js')]);
    expect(src(join('composables', 'useTheme.js'))).toMatch(
      /STORAGE_KEY\s*=\s*'passbox\.theme'/,
    );
  });

  it('masks secret inputs by default', () => {
    for (const file of [
      'components/SecretModal.vue',
      'components/UnlockScreen.vue',
    ]) {
      expect(src(file), file).toMatch(/revealed\s*=\s*ref\(false\)/);
      expect(src(file), file).toContain(
        `:type="revealed ? 'text' : 'password'"`,
      );
    }
    // The detail panel never renders plaintext unless explicitly revealed.
    const detail = src('components/DetailPanel.vue');
    expect(detail).toMatch(/revealed\s*=\s*ref\(false\)/);
    expect(detail).toContain('revealed ? item.secret : maskedSecret');
  });

  it('uses autocomplete="off" on every secret-bearing input', () => {
    for (const file of [
      'components/UnlockScreen.vue',
      'components/SecretModal.vue',
      'components/SearchBar.vue',
      'components/CloudSettings.vue',
    ]) {
      expect(src(file), file).toContain('autocomplete="off"');
    }
  });

  it('schedules the sensitive auto-clear on the clipboard fallback path too', () => {
    const clipboard = src('lib/clipboard.js');
    expect(clipboard).toContain('scheduleSensitiveClear');
    expect(clipboard).toMatch(
      /if \(options\.sensitive\)\s+scheduleSensitiveClear/,
    );
  });
});

describe('S10 — automatic idle lock', () => {
  it('starts the idle lock after authentication and stops it on lock and unmount', () => {
    const app = src('App.vue');
    expect(app).toContain(
      "import { startIdleLock } from './lib/idle-lock.js';",
    );
    expect(app).toMatch(
      /function onAuthenticated\(payload\)[\s\S]*?startIdleLock/,
    );
    expect(app).toMatch(/async function lock\(\)[\s\S]*?stopIdleLock/);
    expect(app).toMatch(/onUnmounted\(\(\) => \{[\s\S]*?stopIdleLock\(\)/);
  });
});

describe('S1 — responsive navigation', () => {
  it('collapses the sidebar to an icon rail below 1024px', () => {
    const sidebar = src('components/SidebarNav.vue');
    const aside = /<aside\s+class="([^"]+)"/.exec(sidebar)?.[1] ?? '';
    const tokens = aside.split(/\s+/);
    const widthToken = tokens.find((token) => token.startsWith('w-'));
    expect(widthToken, 'sidebar needs an explicit width').toBeDefined();
    const width = widthToken.startsWith('w-[')
      ? Number(/(\d+)/.exec(widthToken)[1])
      : Number(/w-(\d+)/.exec(widthToken)[1]) * PX_PER_UNIT;
    expect(
      width,
      'base width must be an icon rail (<= 64px)',
    ).toBeLessThanOrEqual(64);
    expect(aside, 'rail is hidden on phones').toContain('hidden');
    expect(aside, 'rail starts at 640px').toMatch(/(^|\s)sm:flex/);
    expect(aside, 'full index restored at 1024px').toMatch(/(^|\s)lg:w-/);
    expect(sidebar, 'labels stay hidden below lg').toMatch(
      /hidden[^"]*lg:(inline|block)/,
    );
  });

  it('shows the bottom navigation only below 640px', () => {
    const app = src('App.vue');
    const nav = /<nav\s+class="([^"]*)"/.exec(app)?.[1] ?? '';
    expect(nav, 'bottom nav must disappear at 640px').toMatch(
      /(^|\s)sm:hidden(\s|$)/,
    );
    expect(nav).not.toMatch(/(^|\s)md:hidden(\s|$)/);
  });
});

describe('S11 — 44px touch targets on mobile', () => {
  it('never declares a mobile control smaller than 44px', () => {
    const violations = [];
    for (const file of vueFiles) {
      const text = sources.get(file);
      for (const match of text.matchAll(
        /<(button|a|input|select|textarea)\b([^>]*)>/g,
      )) {
        const [, tag, attrs] = match;
        // A checkbox/radio inside its label is targeted by the whole label.
        if (tag === 'input' && /type="(checkbox|radio)"/.test(attrs)) continue;
        const classAttr = /class="([^"]*)"/.exec(attrs)?.[1];
        if (!classAttr) continue;
        for (const token of mobileSizeViolations(classAttr)) {
          violations.push(`${rel(file)} <${tag}> ${token}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('gives every icon-only mobile control a 44px minimum width', () => {
    const violations = [];
    for (const file of vueFiles) {
      const text = sources.get(file);
      for (const match of text.matchAll(
        /<button\b([^>]*)>(?:(?!<\/button>).)*?(hidden sm:inline|sr-only sm:hidden)/gs,
      )) {
        const cls = /class="([^"]*)"/.exec(match[1])?.[1] ?? '';
        if (!cls.includes('min-w-11')) {
          violations.push(`${rel(file)}: ${cls.slice(0, 60)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the shared control classes at 44px or more by default', () => {
    const css = src('index.css');
    const violations = [];
    for (const selector of ['.btn', '.row-action', '.chip', '.field']) {
      const block = new RegExp(
        `${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`,
      ).exec(css)?.[1];
      expect(block, `${selector} class must exist in index.css`).toBeDefined();
      for (const token of block.split(/\s+/)) {
        const match = token.match(/^(?:size|h|w)-(\d+)$/);
        if (match && Number(match[1]) * PX_PER_UNIT < 44) {
          violations.push(`${selector} ${token}`);
        }
      }
      if (selector === '.field') expect(block).toContain('height: 44px');
    }
    expect(violations).toEqual([]);
  });
});

describe('S6 — dialog focus', () => {
  it('restores focus to the trigger when a dialog closes', () => {
    const combined =
      src('App.vue') +
      src('components/SecretModal.vue') +
      src('components/ui/ConfirmDialog.vue');
    expect(combined).toMatch(
      /returnFocus|restoreFocus|triggerRef|focusReturn|lastFocused/,
    );
    expect(src('components/SecretModal.vue')).toContain('target.focus()');
  });
});

describe('S14 — art direction', () => {
  const css = src('index.css');

  it('uses the bundled IBM Plex families', () => {
    expect(css).toContain("'IBM Plex Sans Variable'");
    expect(css).toContain("'IBM Plex Mono'");
  });

  it('keeps the single petrol-teal accent and no AI-SaaS violet', () => {
    expect(css).toContain('--pb-accent: #0f6b66');
    for (const banned of [
      '#5b5bd6',
      '#6366f1',
      '#8b5cf6',
      '#7c3aed',
      '#a855f7',
      '#4f46e5',
      '#818cf8',
    ]) {
      expect(css.toLowerCase()).not.toContain(banned);
    }
  });

  it('uses no decorative gradients', () => {
    expect(css).not.toMatch(/(linear|radial|conic)-gradient/);
    for (const [file, text] of sources) {
      expect(text, rel(file)).not.toMatch(/(linear|radial|conic)-gradient/);
    }
  });

  it('renders the original brand mark, not a key glyph', () => {
    expect(src('components/ui/BrandMark.vue')).toContain('viewBox="0 0 32 32"');
    expect(src('components/SidebarNav.vue')).toContain('BrandMark');
    expect(src('App.vue')).toContain('BrandMark');
  });

  it('uses tabular figures on every numeric readout', () => {
    expect(src('App.vue')).toMatch(/tabular-nums/);
    expect(src('components/GeneratorView.vue')).toMatch(/tabular-nums/);
    expect(src('components/DetailPanel.vue')).toMatch(/tabular-nums/);
    expect(src('components/SecurityView.vue')).toMatch(/tabular-nums/);
  });

  it('ships a reproducible application icon pipeline', () => {
    expect(read(join(repoRoot, 'forge.config.mjs'))).toContain(
      "icon: 'assets/icons/icon'",
    );
    expect(read(join(repoRoot, 'index.html'))).toMatch(
      /rel="icon"[^>]*icon\.svg/,
    );
    expect(read(join(repoRoot, 'package.json'))).toContain(
      'scripts/build-icons.mjs',
    );
    for (const file of [
      'assets/icon.svg',
      'assets/icons/icon.ico',
      'assets/icons/icon.icns',
      'assets/icons/icon-512.png',
    ]) {
      expect(existsSync(join(repoRoot, file)), file).toBe(true);
    }
  });
});
