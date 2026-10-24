const button=document.querySelector('.menu-toggle');const nav=document.querySelector('#navigation');button?.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});

const themeButton = document.querySelector('.theme-toggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  themeButton?.setAttribute('aria-pressed', String(dark));
  themeButton?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  const label = themeButton?.querySelector('.theme-label');
  if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111c19' : '#f6f5ef');
}
applyTheme(document.documentElement.dataset.theme || 'light');
themeButton?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('uaemuna-theme', next); } catch {}
  applyTheme(next);
});
systemTheme.addEventListener('change', event => {
  let saved;
  try { saved = localStorage.getItem('uaemuna-theme'); } catch {}
  if (saved !== 'dark' && saved !== 'light') applyTheme(event.matches ? 'dark' : 'light');
});
