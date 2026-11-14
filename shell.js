'use strict';
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const isGamePage = document.body.classList.contains('game-page') || document.body.dataset.page === 'robotdog';
const mobileMenu = window.matchMedia(isGamePage ? '(max-width: 1100px), (pointer: coarse)' : '(max-width: 760px)');
function setMenu(open, restoreFocus = false) {
  const visible = open && mobileMenu.matches;
  document.body.classList.toggle('menu-open', visible);
  menuToggle.setAttribute('aria-expanded', String(visible));
  menuToggle.setAttribute('aria-label', visible ? '메뉴 닫기' : '메뉴 열기');
  backdrop.hidden = !visible;
  sidebar.inert = mobileMenu.matches && !visible;
  if (visible) (sidebar.querySelector('[aria-current="page"]')||sidebar.querySelector('a')).focus();
  if (restoreFocus) menuToggle.focus();
}
menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
backdrop.addEventListener('click', () => setMenu(false, true));
document.addEventListener('keydown', event => {
  if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') { event.preventDefault(); setMenu(false, true); }
  if (event.key === 'Tab') {
    const items = [menuToggle, ...[...sidebar.querySelectorAll('a[href], summary')].filter(el=>el.getClientRects().length>0)];
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

// Keep a connected calendar explicit in menu/home links, including copied links.
function syncCalendarMenuLinks(){
 let saved=null;try{saved=localStorage.getItem('mydesk.calendar.family');}catch{}
 const shared=new URLSearchParams(location.hash.slice(1)).get('family'),valid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''),id=valid(shared)?shared:valid(saved)?saved:null;
 if(id)for(const link of document.querySelectorAll('a[href^="calendar.html"]'))link.setAttribute('href','calendar.html#family='+id.toLowerCase());
}
syncCalendarMenuLinks();window.addEventListener('pageshow',syncCalendarMenuLinks);window.addEventListener('storage',e=>{if(e.key==='mydesk.calendar.family')syncCalendarMenuLinks();});

// Navigation is shared by all pages and refreshed from the server.
import('./site-navigation.mjs?v=swing1').then(module=>module.loadNavigation()).catch(()=>{});
