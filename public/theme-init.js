(() => {
  let saved;
  try { saved = localStorage.getItem('uaemuna-theme'); } catch {}
  const theme = saved === 'dark' || saved === 'light'
    ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
