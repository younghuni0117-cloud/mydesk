'use strict';
(() => {
  const body = document.body;
  const compact = window.matchMedia('(max-width: 1100px), (pointer: coarse)');
  const viewport = window.visualViewport;
  const boardWrap = document.querySelector('.board-wrap');
  const board = document.getElementById('board');
  const dialog = document.getElementById('game-help');
  const helpButton = document.getElementById('game-help-open');
  const fullscreenButton = document.getElementById('game-fullscreen');
  let resizeFrame = null;
  function fitBoard() {
    if (!board) return;
    if (!body.classList.contains('fit-game')) { board.style.removeProperty('width'); return; }
    const box = boardWrap.getBoundingClientRect();
    board.style.width = `${Math.max(0, Math.floor(Math.min(box.width, box.height, 440)))}px`;
  }
  function fit() {
    resizeFrame = null;
    // Keep browser zoom usable. Very short windows fall back to normal scrolling.
    const zoomed = viewport && Math.abs(viewport.scale - 1) > .05;
    const width = document.documentElement.clientWidth;
    const height = Math.floor(viewport && !zoomed ? viewport.height : window.innerHeight);
    const robotScroll = body.dataset.page === 'robot';
    const enabled = !robotScroll && compact.matches && !zoomed && width >= 280 && (height >= 540 || (width >= 540 && height >= 360));
    body.classList.toggle('fit-game', enabled);
    body.classList.toggle('short-game', enabled && width < 540 && height < 640);
    body.style.setProperty('--game-height', `${height}px`);
    fitBoard();
  }
  function scheduleFit() {
    if (resizeFrame === null) resizeFrame = requestAnimationFrame(fit);
  }
  compact.addEventListener('change', scheduleFit);
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  if (viewport) viewport.addEventListener('resize', scheduleFit);
  if (boardWrap && typeof ResizeObserver !== 'undefined') new ResizeObserver(fitBoard).observe(boardWrap);
  helpButton.addEventListener('click', () => {
    document.dispatchEvent(new Event('game:help-open'));
    dialog.showModal();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => helpButton.focus({ preventScroll: true }));
  fullscreenButton.hidden = !document.fullscreenEnabled;
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* The regular viewport layout remains available if fullscreen is denied. */ }
  });
  document.addEventListener('fullscreenchange', () => {
    const expanded = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute('aria-label', expanded ? '전체 화면 종료' : '전체 화면으로 보기');
    fullscreenButton.title = expanded ? '전체 화면 종료' : '전체 화면으로 보기';
    scheduleFit();
  });
  fit();
  if (location.hash === '#how') dialog.showModal();
})();
