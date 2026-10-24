import { darkColors, lightColors } from '@/theme';

/**
 * Browser surfaces the components don't draw: keyboard focus ring, text selection, caret and
 * placeholder colour, themed from the tokens for both colour schemes. Installed once at startup.
 */
export function installWebSurfaces(): void {
  if (typeof document === 'undefined' || document.getElementById('harada-web-surfaces')) return;
  const rules = (c: typeof lightColors) => `
    :focus { outline: none; }
    :focus-visible { outline: 2px solid ${c.focus}; outline-offset: 2px; border-radius: 4px; }
    ::selection { background: ${c.accentSoft}; color: ${c.ink}; }
    input, textarea { caret-color: ${c.accent}; }
    ::placeholder { color: ${c.inkFaint}; opacity: 1; }
    html, body { background: ${c.paper}; }
  `;
  const style = document.createElement('style');
  style.id = 'harada-web-surfaces';
  style.textContent = `${rules(lightColors)}\n@media (prefers-color-scheme: dark) {${rules(darkColors)}}`;
  document.head.appendChild(style);
}
