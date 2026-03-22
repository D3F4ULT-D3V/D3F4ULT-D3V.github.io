/* ================================================================
   sfx.js: ctOS Sound Effects Manager
   ================================================================
*/

(function () {
  'use strict';

  const BASE = 'assets/sound_effects/';
  const pool = {};
  let hoverReady = true;

  function preload(name, file) {
    const a = new Audio(BASE + file);
    a.preload = 'auto';
    pool[name] = a;
  }

  preload('chime', 'ctos_chime.mp3');
  preload('click', 'ctos_ui_click.mp3');
  preload('hover', 'ctos_ui_hover.mp3');

  function play(name) {
    const src = pool[name];
    if (!src) return;
    // Clone so sounds can overlap
    const a = src.cloneNode();
    a.volume = 0.65;
    a.play().catch(() => { /* autoplay policy — silenced */ });
  }

  function hover() {
    if (!hoverReady) return;
    play('hover');
    hoverReady = false;
    setTimeout(() => { hoverReady = true; }, 120);
  }

  window.SFX = { play, hover };
})();