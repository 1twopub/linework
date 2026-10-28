// Linework — the wordmark menu (Draw / Chess). Built on <details>, so it works without this too;
// this just closes it when you tap elsewhere, press Escape, or pick an item.
const menu = document.getElementById('modeMenu');
if (menu) {
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.mode-item');
    if (item && item.getAttribute('aria-current') === 'page') { e.preventDefault(); menu.open = false; }
  });
}
