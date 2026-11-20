'use strict';
// Small vector shortcuts share the same destinations without changing app data.
function mountHeaderShortcuts() {
  const location = document.querySelector('.topbar-location');
  const map = document.querySelector('.map-app');
  if (!location && !map) return;
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet'; sheet.href = 'header-shortcuts.css?v=2';
  document.head.append(sheet);
  const toggle = document.getElementById('menu-toggle');
  if (toggle) toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const nav = document.createElement('nav');
  nav.className = 'header-shortcuts'; nav.setAttribute('aria-label', '바로가기');
  const icons = [
    ['calendar', '가족 달력', 'calendar.html', '<rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01"/>'],
    ['mindmap', '마인드맵', 'mindmap.html', '<rect x="8" y="3" width="8" height="5" rx="1.5"/><path d="M12 8v4M5 16v-4h14v4"/><rect x="2" y="16" width="6" height="5" rx="1.5"/><rect x="9" y="16" width="6" height="5" rx="1.5"/><rect x="16" y="16" width="6" height="5" rx="1.5"/>'],
    ['restaurants', '맛집 기록', 'restaurants.html', '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18m10-8v8m0-8c-4 0-4-10 0-10s4 10 0 10Z"/>']
  ];
  for (const [page, label, href, paths] of icons) {
    const link = document.createElement('a');
    link.href = href; link.title = label; link.setAttribute('aria-label', label);
    if (document.body.dataset.page === page) link.setAttribute('aria-current', 'page');
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    nav.append(link);
  }
  if (location) {
    for (const child of [...location.children]) if (child.id !== 'menu-toggle') child.remove();
    location.append(nav);
  } else {
    nav.classList.add('map-header-shortcuts'); map.append(nav);
  }
}
mountHeaderShortcuts();
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const isGamePage = document.body.classList.contains('game-page') || ['robotdog', 'evolution'].includes(document.body.dataset.page);
const mobileMenu = window.matchMedia(document.body.dataset.page === 'mindmap' ? '(min-width: 0px)' : isGamePage ? '(max-width: 1100px), (pointer: coarse)' : '(max-width: 760px)');
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
