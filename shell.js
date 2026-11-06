'use strict';
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const isGamePage = document.body.classList.contains('game-page');
const mobileMenu = window.matchMedia(isGamePage ? '(max-width: 1100px), (pointer: coarse)' : '(max-width: 760px)');
function setMenu(open, restoreFocus = false) {
  const visible = open && mobileMenu.matches;
  document.body.classList.toggle('menu-open', visible);
  menuToggle.setAttribute('aria-expanded', String(visible));
  menuToggle.setAttribute('aria-label', visible ? '메뉴 닫기' : '메뉴 열기');
  backdrop.hidden = !visible;
  sidebar.inert = mobileMenu.matches && !visible;
  if (visible) sidebar.querySelector('[aria-current="page"]').focus();
  if (restoreFocus) menuToggle.focus();
}
menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
backdrop.addEventListener('click', () => setMenu(false, true));
document.addEventListener('keydown', event => {
  if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') { event.preventDefault(); setMenu(false, true); }
  if (event.key === 'Tab') {
    const items = [menuToggle, ...sidebar.querySelectorAll('a[href]')];
    const index = items.indexOf(document.activeElement);
    const next = event.shiftKey ? (index - 1 + items.length) % items.length : (index + 1) % items.length;
    event.preventDefault(); items[next].focus();
  }
});
mobileMenu.addEventListener('change', () => setMenu(false));
setMenu(false);
// Preserve links shared before games moved to their own pages.
if (document.body.dataset.page === 'home') {
  const legacy = { '#cartpole': 'cartpole.html', '#experiments': 'maze.html', '#how': 'maze.html#how' };
  const redirectLegacy = () => { if (legacy[location.hash]) location.replace(legacy[location.hash]); };
  redirectLegacy();
  window.addEventListener('hashchange', redirectLegacy);
}
