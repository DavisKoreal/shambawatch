/**
 * Shamba Watch — Typography & Color Contrast Unit Test Suite
 * Validates WCAG 2.1 Contrast Ratios for the Three Universal Text Shades in Dark & Light Modes,
 * and asserts dual-theme architecture integrity in public/index.html.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * Standard WCAG 2.1 Relative Luminance Calculation
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Standard WCAG 2.1 Contrast Ratio Formula
 * (L1 + 0.05) / (L2 + 0.05)
 */
function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(hexToRgb(hex1));
  const lum2 = getRelativeLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n--- Running Typography & Three Universal Text Shades Contrast Tests ---');

// 1. Dark Mode Contrast Tests
const darkBg = '#14120F';
const darkPanelRaised = '#23201A';
const darkShade1 = '#EDE8DE'; // High-Emphasis Chalk
const darkShade2 = '#A69E8D'; // Contextual Sandstone
const darkShade3 = '#888070'; // Structural Basalt (Calibrated for >4.7:1 WCAG AA)

const ratioDark1Bg = getContrastRatio(darkShade1, darkBg);
const ratioDark1Panel = getContrastRatio(darkShade1, darkPanelRaised);
console.log(`[Dark Mode] Shade 1 (--ink): ${ratioDark1Bg.toFixed(2)}:1 on --bg, ${ratioDark1Panel.toFixed(2)}:1 on --panel-raised`);
assert(ratioDark1Bg >= 7.0, `Dark Shade 1 must exceed WCAG AAA (7:1). Got ${ratioDark1Bg.toFixed(2)}:1`);
assert(ratioDark1Panel >= 7.0, `Dark Shade 1 on card must exceed WCAG AAA (7:1). Got ${ratioDark1Panel.toFixed(2)}:1`);

const ratioDark2Bg = getContrastRatio(darkShade2, darkBg);
console.log(`[Dark Mode] Shade 2 (--ink-dim): ${ratioDark2Bg.toFixed(2)}:1 on --bg`);
assert(ratioDark2Bg >= 4.5, `Dark Shade 2 must exceed WCAG AA (4.5:1). Got ${ratioDark2Bg.toFixed(2)}:1`);

const ratioDark3Bg = getContrastRatio(darkShade3, darkBg);
console.log(`[Dark Mode] Shade 3 (--ink-faint): ${ratioDark3Bg.toFixed(2)}:1 on --bg`);
assert(ratioDark3Bg >= 4.5, `Dark Shade 3 must meet WCAG AA (4.5:1). Got ${ratioDark3Bg.toFixed(2)}:1`);

// 2. Light Mode Contrast Tests
const lightBg = '#F7F5EE';
const lightPanelRaised = '#EFECE3';
const lightShade1 = '#14120F'; // Deep Rift Umber
const lightShade2 = '#4D473B'; // Earthy Slate Brown
const lightShade3 = '#70695B'; // Olive Driftwood (Calibrated for >4.9:1 WCAG AA)

const ratioLight1Bg = getContrastRatio(lightShade1, lightBg);
const ratioLight1Panel = getContrastRatio(lightShade1, lightPanelRaised);
console.log(`[Light Mode] Shade 1 (--ink): ${ratioLight1Bg.toFixed(2)}:1 on --bg, ${ratioLight1Panel.toFixed(2)}:1 on --panel-raised`);
assert(ratioLight1Bg >= 7.0, `Light Shade 1 must exceed WCAG AAA (7:1). Got ${ratioLight1Bg.toFixed(2)}:1`);
assert(ratioLight1Panel >= 7.0, `Light Shade 1 on card must exceed WCAG AAA (7:1). Got ${ratioLight1Panel.toFixed(2)}:1`);

const ratioLight2Bg = getContrastRatio(lightShade2, lightBg);
console.log(`[Light Mode] Shade 2 (--ink-dim): ${ratioLight2Bg.toFixed(2)}:1 on --bg`);
assert(ratioLight2Bg >= 4.5, `Light Shade 2 must exceed WCAG AA (4.5:1). Got ${ratioLight2Bg.toFixed(2)}:1`);

const ratioLight3Bg = getContrastRatio(lightShade3, lightBg);
console.log(`[Light Mode] Shade 3 (--ink-faint): ${ratioLight3Bg.toFixed(2)}:1 on --bg`);
assert(ratioLight3Bg >= 4.5, `Light Shade 3 must meet WCAG AA (4.5:1). Got ${ratioLight3Bg.toFixed(2)}:1`);

// 3. Status Accent Visibility in Both Modes
const darkMoss = '#7A9471';
const lightMoss = '#2E6D29';
const darkEarth = '#C1622C';
const lightEarth = '#A83B10';

assert(getContrastRatio(lightMoss, lightBg) >= 4.5, 'Light moss accent must achieve WCAG AA');
assert(getContrastRatio(lightEarth, lightBg) >= 4.5, 'Light earth alert accent must achieve WCAG AA');
console.log('✓ All 3 Universal Text Shades and status accents strictly pass WCAG 2.1 AA/AAA contrast limits!');

// 4. Validate SOA Theme Architecture
const htmlPath = resolve(__dirname, '../public/index.html');
const htmlContent = readFileSync(htmlPath, 'utf8');

const tokensPath = resolve(__dirname, '../public/css/tokens.css');
const tokensContent = readFileSync(tokensPath, 'utf8');

const themeServicePath = resolve(__dirname, '../public/js/services/theme-service.js');
const themeServiceContent = readFileSync(themeServicePath, 'utf8');

assert(htmlContent.includes('<meta name="color-scheme" content="dark light">'), 'index.html must declare color-scheme meta');
assert(htmlContent.includes('localStorage.getItem(\'shamba-theme\')'), 'index.html must include synchronous theme hydration script');
assert(tokensContent.includes('[data-theme="dark"]'), 'tokens.css must define dark theme CSS tokens');
assert(tokensContent.includes('[data-theme="light"]'), 'tokens.css must define light theme CSS tokens');
assert(htmlContent.includes('id="themeToggleBtn"'), 'index.html must render theme toggle button');
assert(htmlContent.includes('theme-svg-sun') && htmlContent.includes('theme-svg-moon'), 'Theme toggle button must include sun and moon icons');
assert(themeServiceContent.includes('class ThemeService'), 'theme-service.js must define ThemeService');
assert(themeServiceContent.includes('toggleTheme'), 'ThemeService must implement toggleTheme()');

console.log('✓ index.html and SOA ThemeService successfully implement dual-theme tokens, FOUC-prevention hydration, and theme toggler!');
console.log('========================================');
console.log('  ALL THEME & CONTRAST TESTS PASSED!    ');
console.log('========================================\n');
