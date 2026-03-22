/* ================================================================
   terminal.js — D3F4ULT Portfolio ctOS Terminal
   ================================================================ */

(function () {
  'use strict';

  // ── DOM ────────────────────────────────────────────────────────
  const $ls        = document.getElementById('lockscreen');
  const $lsLogin   = document.getElementById('ls-login-btn');
  const $lsGuest   = document.getElementById('ls-guest-btn');
  const $lsUser    = document.getElementById('ls-username');
  const $lsErr     = document.getElementById('ls-error');
  const $lsClock   = document.getElementById('ls-clock');
  const $lsDate    = document.getElementById('ls-date-str');
  const $lsLogEl   = document.getElementById('ls-log-lines');

  const $bar       = document.getElementById('bar');
  const $shell     = document.getElementById('shell');
  const $out       = document.getElementById('output');
  const $input     = document.getElementById('cmd-input');
  const $promptSym = document.getElementById('prompt-sym');
  const $accessTag = document.getElementById('bar-access-tag');
  const $siDate    = document.getElementById('si-date');
  const $siTime    = document.getElementById('si-time');
  const $siUp      = document.getElementById('si-uptime');
  const $wsList    = document.querySelectorAll('.ws[data-cmd]');

  const $viewer    = document.getElementById('post-viewer');
  const $pvTitle   = document.getElementById('pv-title');
  const $pvMeta    = document.getElementById('pv-meta');
  const $pvBody    = document.getElementById('pv-content');
  const $pvClose   = document.getElementById('pv-close');

  // ── Session state ──────────────────────────────────────────────
  const BOOT_AT = Date.now();
  const hist    = [];
  let histIdx   = -1;
  let posts     = [];
  let projects  = [];
  let locked    = false;
  let accessLevel = 'guest'; // 'guest' | 'admin'

  // ── Utilities ──────────────────────────────────────────────────
  function pad(n, w = 2) { return String(n).padStart(w, '0'); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Clock (shared by lockscreen + bar) ────────────────────────
  function getTimeParts() {
    const d = new Date();
    return {
      hhmm:   `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      ss:     pad(d.getSeconds()),
      ddmmyy: `${pad(d.getDate())}${pad(d.getMonth()+1)}${String(d.getFullYear()).slice(2)}`,
      full:   d,
    };
  }

  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  function tickClock() {
    const { hhmm, ddmmyy, full } = getTimeParts();
    const s = Math.floor((Date.now() - BOOT_AT) / 1000);

    // Lockscreen
    if ($lsClock) $lsClock.textContent = hhmm;
    if ($lsDate)  $lsDate.textContent  = `${full.getDate()} ${MONTHS[full.getMonth()]} ${full.getFullYear()}`;

    // Bar
    if ($siDate) $siDate.textContent = ddmmyy;
    if ($siTime) $siTime.textContent = hhmm;
    if ($siUp)   $siUp.textContent   = `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`;
  }

  // ── Lockscreen fake terminal log ───────────────────────────────
  const LS_BOOT_LOG = [
    '» kernel: blume-krn-1.0.8 loaded',
    '» ctOS daemon: initializing...',
    '» [  OK  ] network stack ready',
    '» [  OK  ] ctsd service started',
    '» [  OK  ] filesystem mounted ro',
    '» greeter: waiting for operator identification',
  ];

  async function runLockscreenLog() {
    for (let i = 0; i < LS_BOOT_LOG.length; i++) {
      await sleep(220 + Math.random() * 180);
      const el = document.createElement('div');
      el.className = 'ls-log-line';
      el.textContent = LS_BOOT_LOG[i];
      $lsLogEl.appendChild(el);
      // small delay then fade in
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('vis')));
    }
  }

  // ── Lockscreen login flow ──────────────────────────────────────
  function attemptLogin() {
    const username = $lsUser.value.trim();
    if (!username) {
      $lsErr.textContent = 'USERNAME REQUIRED';
      $lsUser.focus();
      return;
    }
    $lsErr.textContent = '';
    enterTerminal('admin', username);
  }

  function attemptGuest() {
    enterTerminal('guest', null);
  }

  function enterTerminal(level, username) {
    accessLevel = level;

    // Update access tag in bar
    $accessTag.style.display = '';
    $accessTag.className = `si-tag ${level}`;
    $accessTag.textContent = level === 'admin' ? `[${username.toUpperCase()}]` : '[GUEST]';

    // Prompt symbol
    $promptSym.textContent = level === 'admin' ? '# ' : '$ ';

    // Fade out lockscreen
    $ls.classList.add('fade-out');
    setTimeout(() => {
      $ls.classList.add('gone');
      $bar.classList.remove('hidden');
      $shell.classList.remove('hidden');
      if (window.SFX) SFX.play('chime');
      boot(level, username);
    }, 400);
  }

  $lsLogin.addEventListener('click', attemptLogin);
  $lsGuest.addEventListener('click', attemptGuest);
  $lsUser.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

  // ── Data loading ───────────────────────────────────────────────
  async function ensurePosts() {
    if (posts.length) return;
    try {
      const r = await fetch('posts/index.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      posts = await r.json();
      posts.sort((a, b) => (b.date > a.date ? 1 : -1));
    } catch (e) {
      console.warn('[ctOS] posts/index.json:', e.message);
    }
  }

  async function ensureProjects() {
    if (projects.length) return;
    try {
      const r = await fetch('data/projects.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      projects = await r.json();
    } catch (e) {
      console.warn('[ctOS] data/projects.json:', e.message);
    }
  }

  function postIndexBySlug(slug) {
    const i = posts.findIndex(p => p.slug === slug);
    return i >= 0 ? i + 1 : -1;
  }

  // ── Terminal output helpers ────────────────────────────────────
  function tl(text = '', cls = '') {
    const el = document.createElement('div');
    el.className = 'tl' + (cls ? ' ' + cls : '');
    el.textContent = text;
    $out.appendChild(el);
    return el;
  }

  function blank() {
    const el = document.createElement('div');
    el.className = 'tl blank';
    $out.appendChild(el);
  }

  function scrollEnd() { $out.scrollTop = $out.scrollHeight; }

  async function printLines(lines, stagger = 0) {
    for (const item of lines) {
      const [text, cls] = Array.isArray(item) ? item : [item, ''];
      if (cls === '_blank') blank(); else tl(text, cls);
      scrollEnd();
      if (stagger) await sleep(stagger + Math.random() * stagger * 0.3);
    }
  }

  function echoInput(cmd) {
    const row = document.createElement('div');
    row.className = 'tl-input';
    row.innerHTML = `<span class="tl-prompt">${accessLevel === 'admin' ? '# ' : '$ '}</span><span class="tl-typed">${esc(cmd)}</span>`;
    $out.appendChild(row);
  }

  /** Line with a single clickable span */
  function tlLink(prefix, linkText, suffix, cls, onClick) {
    const el = document.createElement('div');
    el.className = 'tl' + (cls ? ' ' + cls : '');
    if (prefix) el.appendChild(document.createTextNode(prefix));
    const a = document.createElement('span');
    a.className = 'tl-link';
    a.textContent = linkText;
    a.addEventListener('mouseenter', () => { if (window.SFX) SFX.hover(); });
    a.addEventListener('click', e => { e.stopPropagation(); if (window.SFX) SFX.play('click'); onClick(); });
    el.appendChild(a);
    if (suffix) el.appendChild(document.createTextNode(suffix));
    $out.appendChild(el);
    return el;
  }

  // ── Text utilities ─────────────────────────────────────────────
  function hr(label = '', w = 58) {
    if (!label) return '─'.repeat(w);
    const inner = `  ${label}  `;
    const rem = Math.max(0, w - inner.length);
    const l = Math.floor(rem / 2);
    return '─'.repeat(l) + inner + '─'.repeat(rem - l);
  }

  function pbar(pct, w = 16) {
    const f = Math.round(Math.min(100, Math.max(0, pct)) / 100 * w);
    return '[' + '█'.repeat(f) + '░'.repeat(w - f) + ']';
  }

  // ── Post viewer ────────────────────────────────────────────────
  function openPostViewer(post, rawMd) {
    const body = rawMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    $pvBody.innerHTML = marked.parse(body);
    $pvBody.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
    $pvTitle.textContent = `// ${post.title}`;
    const tags = (post.tags || []).map(t => `<span class="pv-tag">[${esc(t)}]</span>`).join(' ');
    $pvMeta.style.cssText =
      'padding:6px min(10%,80px);max-width:820px;margin:0 auto;font-size:11px;' +
      'color:var(--text-dim);display:flex;gap:10px;flex-wrap:wrap;' +
      'border-bottom:1px solid var(--border);width:100%';
    $pvMeta.innerHTML = `<span>${post.date}</span><span>::</span><span>${post.readTime||'?'}</span><span>::</span>${tags}`;
    $viewer.classList.add('open');
    $shell.classList.add('hidden');
    document.title = `${post.title} // D3F4ULT`;
    $pvBody.scrollTop = 0;
  }

  function closePostViewer() {
    $viewer.classList.remove('open');
    $shell.classList.remove('hidden');
    document.title = 'D3F4ULT // ctOS v2.1.0';
    $input.focus();
  }

  // ── Idle viewer (ASCII art + stopwatch) ───────────────────────
  function closeIdleViewer() {
    const ov = document.getElementById('idle-overlay');
    if (ov) {
      if (ov._stopwatchInterval) {
        clearInterval(ov._stopwatchInterval);
        ov._stopwatchInterval = null;
      }
      ov.classList.remove('open');
    }
    $shell.classList.remove('hidden');
    document.title = 'D3F4ULT // ctOS v2.1.0';
    $input.focus();
  }

  const ASCII_ARTS = {
    defalt: [
      '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠂⠒⠋',
      '⠀⠀⠀⠀⠀⠀⠀⢀⣀⣤⣤⣤⣤⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣤⣶⣶⣶⣤⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠀⢀⣶⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣧⡀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⢘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡃⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣴⣴⣶⣶⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡃⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⣨⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⠀',
      '⠀⠀⢠⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⠀',
      '⠀⣸⡿⠁⠀⠀⠀⠀⣀⣉⣉⠉⠙⠋⠛⠛⠛⠛⠛⠛⠛⠛⠛⠙⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠛⣷⡀⠀⠀⠀',
      '⢠⡿⠀⠀⢠⣶⣿⣿⣿⣿⣿⡛⠻⣦⣄⠀⠀⠀⠀⠀⠀⢀⣤⣶⣾⣿⣶⣶⣦⣄⡀⠀⠀⠀⠀⠸⣷⡀⠀⠀',
      '⣾⠇⠀⠀⣿⣿⠀⣿⣿⣿⣿⡇⠀⠈⢿⡄⠀⠀⠀⠀⣰⣟⠈⣿⣿⣿⣿⣇⠀⠉⢿⡆⠀⠀⠀⠀⢸⣧⠀⠀',
      '⣿⠀⠀⠀⣿⣿⣶⣿⣿⣿⣿⡇⠀⠀⣼⠇⠀⠀⠀⠀⣿⣿⣼⣿⣿⣿⣿⣿⠀⠀⢨⣿⠀⠀⠀⠀⠀⣿⠀⠀',
      '⣿⡄⠀⠀⠘⠿⣿⣿⣿⣿⡿⣀⣠⣼⠟⠀⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⣿⡏⣀⣠⡾⠋⠀⠀⠀⠀⠀⣿⠀⠀',
      '⢸⣧⠀⠀⡠⠐⠚⡩⢙⠛⠛⠋⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠙⠛⠟⠟⠛⠫⢉⠐⠢⢄⠀⠀⠀⣼⡏⠀⠀',
      '⠀⢻⣦⡘⡠⢁⠃⠤⢡⠃⠀⠀⠀⠀⢰⣆⣀⠀⢀⣀⣶⠀⠀⠀⠀⠀⠀⠸⡠⢁⠊⠔⡢⠀⢀⣼⠏⠀⠀⠀',
      '⠀⠀⠉⠻⣮⣅⡈⠈⠁⠀⠀⠀⠀⠀⠀⠉⠛⠛⠛⠋⠁⠀⠀⠀⠀⠀⠀⠀⠈⠀⠁⢈⣠⣶⠟⠉⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠀⠉⠛⠛⠿⠶⣦⣤⣤⣤⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣤⣤⣤⣶⣶⠶⠿⠛⠋⠀⠀⠀⠀⠀⠀⠀',
    ],
    dedsec: [
      '##                        ###',
      '###           ##         ####',
      '###          ###         ####',
      '####        ## ##       #####',
      '#####      ##   ##     ### ##',
      '## ###   ###     ##    ## ## ',
      '##  ##  ###       ##  ##   # ',
      ' #   ####          #####  ## ',
      ' ##   ##            ###   ## ',
      ' ##  ####           ####  ## ',
      ' #####  ##         ### ## ###',
      ' ####    ##       ###   #####',
      ' ###     ###     ###     ####',
      ' ##       ###   ####      ###',
      '           ##  ####       #  ',
      '           #######           ',
      '            ######           ',
      '             ####            ',
    ],
    arch: [
      '                  -`          ',
      '                 .o+`         ',
      '                `ooo/         ',
      '               `+oooo:        ',
      '              `+oooooo:       ',
      '              -+oooooo+:      ',
      '            `/:-:++oooo+:     ',
      '           `/++++/+++++++:    ',
      '          `/++++++++++++++:   ',
      '         `/+++ooooooooooooo/` ',
      '        ./ooosssso++osssssso+ ',
      '       .oossssso-    /ossssss+',
      '      -osssssso.      :ssssssso.',
      '     :osssssss/        osssso++.',
      '    /ossssssss/        +ssssooo/-',
      '  `/ossssso+/:-        -:/+osssso+',
      ' `+sso+:-`                 `-/+oso:',
      '`++:.                           `-/+/',
      '.`                                 `/  ',
      '   ARCH  LINUX                        ',
    ],
    mask: [
      '⠀⠀⠀⠀⢀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣶⣾⣿⣿⣿⣶⣄⠀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⣠⣾⣿⣿⣿⣿⣿⣷⣦⡀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⠇⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠻⣿⣿⣿⣿⣿⣿⣿⣿⣦⣤⣴⣾⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠀⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠀⣿⠿⠿⠿⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢸⠃⠀⠀⠀⣠⣄⡀⠀⠉⠉⠉⠉⠉⠉⠉⠉⠁⣤⣄⠀⠀⠘⣇⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⡿⠀⠀⠀⠀⠿⡿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠿⠿⠀⠀⠀⢹⣤⣤⣄⡀⠀',
      '⢠⡴⠒⢺⡇⠀⠐⡌⢆⠀⠀⠀⢠⡀⠀⠀⣤⡀⠀⠀⣀⠀⠀⠐⣌⠒⠀⠈⣇⠀⠀⠙⢷',
      '⣿⠀⠀⢸⡇⠀⠀⠈⠀⠀⠀⠀⠈⠓⠶⠚⠉⠓⠶⠴⠟⠀⠀⠀⠀⠁⠀⠀⣿⢦⣤⣤⡾',
      '⠈⠓⠶⢾⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢷⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠈⢧⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⠇⠀⠀⠀⠀',
      '⠀⠀⠀⠀⢠⠞⠙⢦⣄⣀⡀⠀⠀⠀⢀⣀⣀⣀⣀⣀⣀⣀⣀⣤⣤⡶⠛⠁⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⣿⠀⠀⠀⢀⡽⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⡿⠁⠀⠀⠈⣷⠀⠀⠀⠀⠀⠀⠀',
      '⠀⠀⠀⠀⠈⠛⠒⠚⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣤⣀⣠⡴⠟⠀⠀⠀⠀⠀⠀⠀',
    ],
  };

  $pvClose.addEventListener('click', closePostViewer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($viewer.classList.contains('open')) { closePostViewer(); return; }
      const idleOv = document.getElementById('idle-overlay');
      if (idleOv?.classList.contains('open')) { closeIdleViewer(); return; }
      const tamaOv = document.getElementById('tama-overlay');
      if (tamaOv?.classList.contains('open')) { window.TamaGotchi?.close(); return; }
      const shootOv = document.getElementById('shooter-overlay');
      if (shootOv?.classList.contains('open')) { window.Shooter?.close(); return; }
    }
  });

  // ── GUEST COMMANDS ─────────────────────────────────────────────
  const GUEST_CMDS = {

    help() {
      printLines([
        ['', '_blank'],
        [hr('AVAILABLE COMMANDS'), 'dim-rule'],
        ['', '_blank'],
        ['  about            operator dossier', ''],
        ['  projects         active operation manifest', ''],
        ['  blog             transmission archive', ''],
        ['  read <n>         open transmission by index', ''],
        ['  open <n>         open project on GitHub', ''],
        ['  status           system resource report', ''],
        ['  scan             network diagnostics', ''],
        ['  github           external node: github.com/D3F4ULT-D3V', ''],
        ['  clear            flush output buffer', ''],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    about() {
      printLines([
        ['', '_blank'],
        [hr('OPERATOR DOSSIER'), 'dim-rule'],
        ['', '_blank'],
        ['  handle      D3F4ULT', 'hi'],
        ['  persona     tribute to Watch_Dogs character Defalt', ''],
        ['  node        github.com/D3F4ULT-D3V', 'dim'],
        ['  role        developer  //  modder  //  systems programmer', ''],
        ['  status      ACTIVE', 'ok'],
        ['', '_blank'],
        [hr('SKILLS'), 'dim-rule'],
        ['', '_blank'],
        [`  ASSEMBLY    ${pbar(85)}  85%`, ''],
        [`  HTML/CSS    ${pbar(90)}  90%`, ''],
        [`  JAVASCRIPT  ${pbar(78)}  78%`, ''],
        [`  JAVA        ${pbar(70)}  70%`, ''],
        [`  LINUX       ${pbar(80)}  80%`, ''],
        ['', '_blank'],
        [hr('ACTIVE OPERATIONS'), 'dim-rule'],
        ['', '_blank'],
        [`  [>>] Sync fabric mod // rope physics   ${pbar(65, 12)}  65%`, ''],
        [`  [>>] ctOS portfolio site               ${pbar(92, 12)}  92%`, ''],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    async projects() {
      await ensureProjects();
      await ensurePosts();

      tl('', 'blank');
      tl(hr('OPERATION MANIFEST'), 'dim-rule');
      tl('', 'blank');
      scrollEnd();

      if (!projects.length) {
        tl('  error: could not load projects (needs HTTP)', 'err');
        tl("  hardcoded fallback: use 'open 1-4' or 'github'", 'dim');
        blank();
        scrollEnd();
        return;
      }

      for (const p of projects) {
        const stCls = p.status === 'ACTIVE' ? 'ok' : 'dim';
        const stackStr = Array.isArray(p.stack) ? p.stack.join(' :: ') : p.stack;

        // Project name → opens GitHub
        tlLink(`  [${p.n}] `, p.name, '', 'hi', () => window.open(p.url, '_blank'));

        tl(`       ${p.type}`, '');
        tl(`       ${stackStr}`, 'dim');
        if (p.desc) tl(`       ${p.desc}`, 'dim');
        tl(`       STATUS: ${p.status}`, stCls);

        // If there's a related post, hint the command without making it a link
        if (p.relatedPost) {
          const pi = postIndexBySlug(p.relatedPost);
          if (pi > 0) {
            tl(`       dev log available — type: open ${p.n} log`, 'dim');
          }
        }

        tl('', 'blank');
        scrollEnd();
      }

      tl(hr(), 'dim-rule');
      tl("  click a project name to open on GitHub", 'dim');
      tl("  type 'open <n>'     to open on GitHub", 'dim');
      tl("  type 'open <n> log' to read the dev log", 'dim');
      tl('', 'blank');
      scrollEnd();
    },

    async blog() {
      await ensurePosts();

      tl('', 'blank');
      tl(hr('TRANSMISSION ARCHIVE'), 'dim-rule');
      tl('', 'blank');
      scrollEnd();

      if (!posts.length) {
        tl('  no transmissions found', 'dim');
        tl('  note: fetch() requires HTTP — deploy to GitHub Pages', 'dim');
        tl('  or run locally: npx serve .', 'dim');
      } else {
        posts.forEach((p, i) => {
          const n    = pad(i + 1);
          const d    = p.date.replace(/-/g, '.');
          const tags = (p.tags || []).map(t => `[${t}]`).join(' ');
          const idx  = i + 1;
          tlLink(`  [${n}] ${d}  `, p.title, '', 'hi', () => ACTIVE_CMDS.read([String(idx)]));
          tl(`       ${tags}  ::  ${p.readTime || '? min'}`, 'dim');
          tl('', 'blank');
        });
      }

      tl(hr(), 'dim-rule');
      tl("  click a title or type 'read <n>' to open", 'dim');
      tl('', 'blank');
      scrollEnd();
    },

    async read(args) {
      await ensurePosts();
      const n = parseInt(args[0], 10);
      if (!posts.length) {
        tl('  error: no posts loaded (needs HTTP — see npx serve .)', 'err');
        return;
      }
      if (!n || n < 1 || n > posts.length) {
        tl(`  error: valid indices 1-${posts.length}. type 'blog' to list.`, 'err');
        return;
      }
      const post = posts[n - 1];
      tl(`» fetching: ${post.slug}...`, 'dim');
      scrollEnd();
      try {
        const r = await fetch(`posts/${post.slug}.md`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        openPostViewer(post, await r.text());
      } catch (e) {
        tl(`  error: ${e.message}`, 'err');
      }
    },

    async open(args) {
      await ensureProjects();
      await ensurePosts();

      const n   = parseInt(args[0], 10);
      const sub = args[1];

      if (!n || n < 1 || n > (projects.length || 4)) {
        tl(`  usage: open <n>       — open project on GitHub`, 'dim');
        tl(`         open <n> log   — read dev log post`, 'dim');
        blank();
        return;
      }

      // sub-command: log → open related blog post
      if (sub === 'log') {
        const p = projects[n - 1];
        if (!p || !p.relatedPost) {
          tl(`  no dev log linked for project ${n}`, 'dim');
          return;
        }
        const pi = postIndexBySlug(p.relatedPost);
        if (pi < 0) {
          tl(`  dev log post not found: ${p.relatedPost}`, 'err');
          return;
        }
        await ACTIVE_CMDS.read([String(pi)]);
        return;
      }

      // default: open GitHub
      const p = projects[n - 1];
      tl(`» opening: ${p.url}`, 'dim');
      scrollEnd();
      setTimeout(() => window.open(p.url, '_blank'), 400);
    },

    status() {
      const cpu = Math.floor(Math.random() * 40 + 8);
      const mem = Math.floor(Math.random() * 30 + 45);
      const s   = Math.floor((Date.now() - BOOT_AT) / 1000);
      printLines([
        ['', '_blank'],
        [hr('SYSTEM STATUS'), 'dim-rule'],
        ['', '_blank'],
        ['  node       D3F4ULT-NODE', 'hi'],
        ['  kernel     blume-krn-1.0.8 <> ctOS-1.0.0-a', 'dim'],
        [`  uptime     ${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`, ''],
        ['  access     GUEST', 'dim'],
        [`  CPU  <>  ${pbar(cpu, 20)}  ${pad(cpu, 3)}%`, ''],
        [`  MEM  <>  ${pbar(mem, 20)}  ${pad(mem, 3)}%`, ''],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    async scan() {
      tl('', 'blank');
      await printLines([['» initiating network scan...', 'dim'], ['» scanning...', 'dim']], 350);

      const barEl = tl('');
      for (let i = 0; i <= 24; i++) {
        const pct = Math.round(i / 24 * 100);
        const f   = Math.round(i / 24 * 20);
        barEl.textContent = `  [${'█'.repeat(f)}${'░'.repeat(20-f)}]  ${pad(pct,3)}%`;
        scrollEnd();
        await sleep(55 + Math.random() * 50);
      }

      const found   = Math.floor(Math.random() * 8 + 8);
      const threats = Math.floor(Math.random() * 3);
      await printLines([
        ['', '_blank'],
        [`  nodes discovered    ${found}`, ''],
        [`  threat vectors      ${threats}`, threats ? 'err' : 'ok'],
        [`  assessment          ${threats ? 'ELEVATED' : 'NOMINAL'}`, threats ? 'err' : 'ok'],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ], 80);
    },

    github() {
      tl('» opening: github.com/D3F4ULT-D3V', 'dim');
      scrollEnd();
      setTimeout(() => window.open('https://github.com/D3F4ULT-D3V', '_blank'), 400);
    },

    clear() { $out.innerHTML = ''; },

    shooter() {
      if (typeof window.Shooter === 'undefined') {
        tl('  error: shooter module not loaded', 'err');
        return;
      }
      $shell.classList.add('hidden');
      window.Shooter.open();
    },

    // aliases
    whoami()        { ACTIVE_CMDS.about(); },
    ls()            { ACTIVE_CMDS.projects(); },
    transmissions() { ACTIVE_CMDS.blog(); },
    man()           { ACTIVE_CMDS.help(); },
    '?'()           { ACTIVE_CMDS.help(); },

    exit() {
      printLines([
        ['  access denied: operator session cannot be terminated', 'err'],
        ['  you are always connected to ctOS', 'dim'],
        ['', '_blank'],
      ]);
    },
  };

  // ── ADMIN COMMANDS (extends guest) ────────────────────────────
  const ADMIN_CMDS = Object.assign({}, GUEST_CMDS, {

    help() {
      printLines([
        ['', '_blank'],
        [hr('AVAILABLE COMMANDS  [ADMINISTRATOR]'), 'dim-rule'],
        ['', '_blank'],
        ['  about            operator dossier', ''],
        ['  projects         active operation manifest', ''],
        ['  blog             transmission archive', ''],
        ['  read <n>         open transmission', ''],
        ['  open <n>         open project on GitHub', ''],
        ['  open <n> log     read project dev log', ''],
        ['  status           system resource report', ''],
        ['  scan             network diagnostics', ''],
        ['  github           external node', ''],
        ['  clear            flush output buffer', ''],
        ['', '_blank'],
        [hr('ADMIN ONLY'), 'dim-rule'],
        ['', '_blank'],
        ['  sysinfo          extended system report', 'ok'],
        ['  whoami           session identity', 'ok'],
        ['  idle [art]       ascii art viewer + idle stopwatch', 'ok'],
        ['     art keys:     defalt | dedsec | arch | mask', 'dim'],
        ['  tamagotchi       ASCII virtual pet mini-game', 'ok'],
        ['  shooter          ASCIItron retro terminal shooter', 'ok'],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    status() {
      const cpu  = Math.floor(Math.random() * 40 + 8);
      const mem  = Math.floor(Math.random() * 30 + 45);
      const swap = Math.floor(Math.random() * 15 + 2);
      const s    = Math.floor((Date.now() - BOOT_AT) / 1000);
      printLines([
        ['', '_blank'],
        [hr('SYSTEM STATUS  [ADMIN]'), 'dim-rule'],
        ['', '_blank'],
        [`  node       D3F4ULT-NODE`, 'hi'],
        [`  kernel     blume-krn-1.0.8 <> ctOS-1.0.0-a`, 'dim'],
        [`  uptime     ${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`, ''],
        [`  operator   ${$lsUser.value.toUpperCase() || 'ADMIN'}`, 'ok'],
        [`  access     ADMINISTRATOR`, 'ok'],
        ['', '_blank'],
        [`  CPU   ${pbar(cpu, 20)}  ${pad(cpu, 3)}%`, ''],
        [`  MEM   ${pbar(mem, 20)}  ${pad(mem, 3)}%`, ''],
        [`  SWAP  ${pbar(swap, 20)}  ${pad(swap, 3)}%`, ''],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    sysinfo() {
      const s = Math.floor((Date.now() - BOOT_AT) / 1000);
      printLines([
        ['', '_blank'],
        [hr('EXTENDED SYSTEM REPORT'), 'dim-rule'],
        ['', '_blank'],
        [`  OS          ctOS-1.0.0-a`, 'ok'],
        [`  Kernel      blume-krn-1.0.8`, ''],
        [`  Uptime      ${pad(Math.floor(s/3600))}h ${pad(Math.floor(s%3600/60))}m ${pad(s%60)}s`, ''],
        [`  Packages    142 (npm), 0 (pkg)`, 'dim'],
        [`  Shell       ctOS terminal v2.1.0`, ''],
        [`  WM          ctOS compositor`, ''],
        [`  Theme       wnkz/monoglow`, ''],
        [`  Font        JetBrains Mono`, ''],
        ['', '_blank'],
        [`  Disk /      ${pbar(38, 20)}  38%   [SSD]`, ''],
        [`  Disk /home  ${pbar(62, 20)}  62%   [SSD]`, ''],
        ['', '_blank'],
        [`  Network     D3F4ULT-NODE`, ''],
        [`  IP          [REDACTED]`, 'dim'],
        [`  MAC         [REDACTED]`, 'dim'],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    whoami() {
      const username = $lsUser.value.trim() || 'admin';
      printLines([
        ['', '_blank'],
        [hr('SESSION IDENTITY'), 'dim-rule'],
        ['', '_blank'],
        [`  username    ${username}`, 'ok'],
        [`  access      ADMINISTRATOR`, 'ok'],
        [`  node        D3F4ULT-NODE`, ''],
        [`  session     ${pad(Math.floor((Date.now()-BOOT_AT)/1000))}s`, 'dim'],
        ['', '_blank'],
        [hr(), 'dim-rule'],
        ['', '_blank'],
      ]);
    },

    idle(args) {
      const key = (args[0] || 'defalt').toLowerCase();
      const art = ASCII_ARTS[key];

      // Build the overlay once
      let ov = document.getElementById('idle-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'idle-overlay';
        ov.innerHTML = `
          <div id="idle-bar">
            <span id="idle-title">// IDLE MODE</span>
            <span id="idle-stopwatch" style="
              font-size:11px;
              color:var(--text-dim);
              letter-spacing:0.12em;
              margin:0 auto 0 20px;
            ">00:00:00</span>
            <button id="idle-close">[ESC] close</button>
          </div>
          <div id="idle-body">
            <pre id="idle-art"></pre>
          </div>`;
        document.body.appendChild(ov);
        document.getElementById('idle-close').addEventListener('click', closeIdleViewer);
      }

      const artEl      = document.getElementById('idle-art');
      const titleEl    = document.getElementById('idle-title');
      const stopwatchEl= document.getElementById('idle-stopwatch');

      // Render ASCII art
      if (art) {
        artEl.textContent = art.join('\n');
        titleEl.textContent = `// IDLE — ${key.toUpperCase()}`;
      } else {
        const available = Object.keys(ASCII_ARTS).join(' | ');
        artEl.textContent = `  art not found: '${key}'\n  available: ${available}`;
        titleEl.textContent = '// IDLE';
      }

      // Stopwatch
      const idleStart = Date.now();
      if (ov._stopwatchInterval) clearInterval(ov._stopwatchInterval);
      stopwatchEl.textContent = '00:00:00';

      ov._stopwatchInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - idleStart) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        stopwatchEl.textContent =
          `${pad(h)}:${pad(m)}:${pad(s)}`;
      }, 1000);

      // Stash interval so closeIdleViewer can clear it
      ov._stopwatchStart = idleStart;

      $shell.classList.add('hidden');
      ov.classList.add('open');
    },

    tamagotchi() {
      if (typeof window.TamaGotchi === 'undefined') {
        tl('  error: tamagotchi module not loaded', 'err');
        return;
      }
      $shell.classList.add('hidden');
      window.TamaGotchi.open();
    },
  });

  // ── Active command set (set on login) ─────────────────────────
  let ACTIVE_CMDS = GUEST_CMDS;

  // ── Dispatch ──────────────────────────────────────────────────
  async function dispatch(raw) {
    const tokens = raw.trim().split(/\s+/);
    const cmd    = tokens[0].toLowerCase();
    const args   = tokens.slice(1);

    if (raw.trim()) { echoInput(raw); blank(); scrollEnd(); }
    if (!cmd) return;

    if (ACTIVE_CMDS[cmd]) {
      await ACTIVE_CMDS[cmd](args);
    } else {
      tl(`  command not found: ${cmd}`, 'err');
      tl(`  type 'help' for available commands`, 'dim');
      blank();
    }
    scrollEnd();
  }

  // ── Tab completion ─────────────────────────────────────────────
  function tabComplete(partial) {
    const p = partial.toLowerCase();
    const keys = Object.keys(ACTIVE_CMDS).filter(k => !['?'].includes(k) && k.startsWith(p));
    if (keys.length === 1) return keys[0];
    if (keys.length > 1) { echoInput(partial); tl('  ' + keys.join('   '), 'dim'); blank(); scrollEnd(); }
    return partial;
  }

  // ── Keyboard ──────────────────────────────────────────────────
  $input.addEventListener('keydown', async e => {
    if (locked && e.key !== 'c' && e.key !== 'l') { e.preventDefault(); return; }
    switch (e.key) {
      case 'Enter': {
        const val = $input.value;
        $input.value = '';
        if (val.trim()) { hist.unshift(val); histIdx = -1; }
        locked = true;
        await dispatch(val);
        locked = false;
        $input.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (histIdx < hist.length - 1) {
          histIdx++;
          $input.value = hist[histIdx];
          requestAnimationFrame(() => $input.setSelectionRange($input.value.length, $input.value.length));
        }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (histIdx > 0) { histIdx--; $input.value = hist[histIdx]; }
        else { histIdx = -1; $input.value = ''; }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        $input.value = tabComplete($input.value);
        $input.setSelectionRange($input.value.length, $input.value.length);
        break;
      }
      case 'c': { if (e.ctrlKey) { e.preventDefault(); echoInput($input.value + '^C'); blank(); $input.value = ''; locked = false; scrollEnd(); } break; }
      case 'l': { if (e.ctrlKey) { e.preventDefault(); ACTIVE_CMDS.clear(); } break; }
    }
  });

  // ── Workspace clicks ──────────────────────────────────────────
  $wsList.forEach(ws => {
    ws.addEventListener('mouseenter', () => { if (window.SFX) SFX.hover(); });
    ws.addEventListener('click', () => {
      if (window.SFX) SFX.play('click');
      if ($viewer.classList.contains('open')) closePostViewer();
      // Close other overlays too
      const idleOv = document.getElementById('idle-overlay');
      if (idleOv?.classList.contains('open')) closeIdleViewer();
      const shootOv = document.getElementById('shooter-overlay');
      if (shootOv?.classList.contains('open')) window.Shooter?.close();
      $wsList.forEach(w => w.classList.remove('active'));
      ws.classList.add('active');
      $input.value = ws.dataset.cmd || 'clear';
      $input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  });

  document.addEventListener('click', () => {
    if (!window.getSelection().toString() && !$viewer.classList.contains('open')) {
      if (!$ls.classList.contains('gone')) return; // lockscreen still showing
      $input.focus();
    }
  });

  // ── Boot sequence (called after login) ────────────────────────
  async function boot(level, username) {
    ACTIVE_CMDS = level === 'admin' ? ADMIN_CMDS : GUEST_CMDS;
    locked = true;
    await Promise.all([ensurePosts(), ensureProjects()]);

    const vb = document.createElement('div');
    vb.className = 'ver-border';
    vb.textContent = 'blume-krn-1.0.8 <> ctOS-1.0.0-a';
    $out.appendChild(vb);
    scrollEnd();
    await sleep(150);

    const who = level === 'admin' ? `${username.toUpperCase()} // ADMINISTRATOR` : 'GUEST // READ-ONLY';
    const log = [
      ['» establishing session...', 'dim', 80],
      [`» [  OK  ] operator: ${who}`, 'ok', 70],
      [`» [  OK  ] ${projects.length} project(s) loaded`, projects.length ? 'ok' : 'dim', 60],
      [`» [  OK  ] ${posts.length} transmission(s) indexed`, posts.length ? 'ok' : 'dim', 60],
      ['» [  OK  ] all systems nominal', 'ok', 50],
    ];

    for (const [text, cls, delay] of log) {
      tl(text, cls);
      scrollEnd();
      await sleep(delay + Math.random() * 40);
    }

    blank();
    tl("  type 'help' for commands — or click a workspace above", 'dim');
    blank();
    scrollEnd();
    locked = false;
    $input.focus();
  }

  // ── Init ──────────────────────────────────────────────────────
  tickClock();
  setInterval(tickClock, 1000);
  runLockscreenLog();

  // Focus username on load
  window.addEventListener('load', () => { if ($lsUser) $lsUser.focus(); });

})();