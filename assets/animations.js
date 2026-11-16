/* ==========================================================================
   CheckChiffreBet — animations de la page d'accueil
   Dépend de GSAP et ScrollTrigger (assets/libs). Ces trois fichiers, puis la
   scène 3D (assets/scene.js), ne sont chargés qu'après l'événement « load » :
   ils ne retardent donc pas l'affichage du texte et des boutons.

   Principes :
   - Le contenu reste lisible sans JavaScript, sans WebGL et avec
     prefers-reduced-motion (dans ce cas rien n'est animé ni chargé).
   - Une seule scène 3D, un seul canevas : il est déplacé dans le bloc
     (« stage ») actuellement visible : hero, puis étapes « Comment ça marche ».
   - Rendu en pause quand aucun bloc n'est visible ou que l'onglet est caché.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var mq = function (q) { return window.matchMedia(q).matches; };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var fine = mq('(hover: hover) and (pointer: fine)');
  var conn = navigator.connection || {};
  var saveData = !!conn.saveData;
  /* Version allégée : petits écrans, écrans tactiles, appareils peu puissants */
  var lite = mq('(max-width: 760px)') || !fine || (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  /* Ce script est chargé après l'événement « load » : on exécute tout de suite si la page est déjà chargée */
  function onLoad(fn) { if (doc.readyState === 'complete') fn(); else window.addEventListener('load', fn); }

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ------------------------------------------------------------------
     1. Compteurs (fonctionnent même sans GSAP)
     ------------------------------------------------------------------ */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length || reduce || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight;
    els.forEach(function (el) {
      el.setAttribute('data-final', el.textContent);
      if (el.getBoundingClientRect().top > vh) el.textContent = '0';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target); run(e.target);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
    function run(el) {
      var to = parseFloat(el.getAttribute('data-count')), t0 = performance.now(), d = 1500;
      (function step(now) {
        var p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3);
        el.textContent = p < 1 ? Math.round(to * e).toLocaleString('fr-FR') : el.getAttribute('data-final');
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
  }

  if (reduce || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') { counters(); return; }
  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('fx');
  counters();

  /* ------------------------------------------------------------------
     2. Apparition des blocs au défilement (profondeur + légère inclinaison)
     ------------------------------------------------------------------ */
  function reveals() {
    var vh = window.innerHeight;
    var groups = [
      ['.section-head', { y: 28 }],
      ['.stat, .info, .feat, .adv, .step', { y: 46, rotationX: 14, z: -80 }],
      ['.faq details', { y: 22 }],
      ['.cta-box', { y: 40, scale: 0.97 }]
    ];
    groups.forEach(function (g) {
      var all = $$(g[0]);
      var below = all.filter(function (el) { return el.getBoundingClientRect().top > vh * 0.92; });
      all.forEach(function (el) { if (below.indexOf(el) < 0) el.classList.add('fx-done'); });
      if (!below.length) return;
      try {
        gsap.set(below, Object.assign({ opacity: 0, transformPerspective: 900, transformOrigin: '50% 100%' }, g[1]));
        var show = function (batch) {
          gsap.to(batch, {
            opacity: 1, y: 0, rotationX: 0, z: 0, scale: 1, duration: 0.9, ease: 'power3.out', stagger: 0.09, overwrite: true,
            onComplete: function () { batch.forEach(function (el) { el.classList.add('fx-done'); }); }
          });
        };
        ScrollTrigger.batch(below, { start: 'top 91%', once: true, onEnter: show, onEnterBack: show });
        /* Filet de sécurité : tout élément déjà dépassé (ancre, rechargement) est affiché */
        onLoad(function () {
          setTimeout(function () {
            below.forEach(function (el) {
              if (el.getBoundingClientRect().top < window.innerHeight * 0.9 && !el.classList.contains('fx-done')) show([el]);
            });
          }, 900);
        });
      } catch (err) { gsap.set(below, { clearProps: 'all' }); }
    });
  }

  /* ------------------------------------------------------------------
     3. Captures : cadres de navigateur inclinés, qui se redressent
        (l'inclinaison CSS dépend de --k, animé au défilement ; le survol redresse)
     ------------------------------------------------------------------ */
  function shots() {
    /* Au repos, les cadres gardent une légère inclinaison (≈ 5°) quand la souris
       peut les survoler ; ils se redressent alors complètement au survol.
       Sur écran tactile (pas de survol), ils finissent bien droits. */
    var repos = fine ? 0.45 : 0;
    $$('.shot').forEach(function (s) {
      s.style.setProperty('--k', '1');
      gsap.to(s, { '--k': repos, ease: 'none', scrollTrigger: { trigger: s, start: 'top 97%', end: 'top 36%', scrub: 0.5 } });
    });
  }

  /* ------------------------------------------------------------------
     4. Inclinaison des cartes au survol (souris uniquement)
     ------------------------------------------------------------------ */
  function tilt() {
    if (!fine) return;
    $$('.feat, .info, .stat').forEach(function (el) {
      var rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      var ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      gsap.set(el, { transformPerspective: 900 });
      el.addEventListener('pointermove', function (e) {
        if (!el.classList.contains('fx-done') || e.pointerType !== 'mouse') return;
        var r = el.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 7);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
      });
      el.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  }

  /* ------------------------------------------------------------------
     5. Boutons « magnétiques » : déplacement de 5 px au maximum, le clic n'est jamais gêné
     ------------------------------------------------------------------ */
  function magnetic() {
    if (!fine) return;
    $$('.hero-ctas .btn, .cta-actions .btn, .nav-cta .btn').forEach(function (b) {
      var xTo = gsap.quickTo(b, 'x', { duration: 0.45, ease: 'power3.out' });
      var yTo = gsap.quickTo(b, 'y', { duration: 0.45, ease: 'power3.out' });
      b.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = b.getBoundingClientRect();
        xTo(clamp((e.clientX - (r.left + r.width / 2)) / r.width, -0.5, 0.5) * 10);
        yTo(clamp((e.clientY - (r.top + r.height / 2)) / r.height, -0.5, 0.5) * 8);
      });
      b.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });
  }

  reveals(); shots(); tilt(); magnetic();

  /* ------------------------------------------------------------------
     6. Scène 3D (chargée en différé)
     ------------------------------------------------------------------ */
  var STEP_VIEWS = [
    { az: -36, el: 8, dist: 1.08, ty: 0, split: 1, retro: 0 },       // 1. accès : vue d'ensemble, façade
    { az: -9, el: 4, dist: 0.80, ty: -3.8, split: 1, retro: 0 },     // 2. connexion : on s'approche de l'entrée
    { az: 32, el: 10, dist: 1.0, ty: 0.4, split: 0, retro: 0 },      // 3. DPE : vision thermique, état initial
    { az: 14, el: 12, dist: 1.0, ty: 0.6, split: 0.46, retro: 1 }    // 4. chiffrage : après travaux (estimation)
  ];
  var STEP_TAGS = ['Façade', 'Façade', 'Vision thermique · état initial', 'Après travaux · estimation'];

  function start3D() {
    var heroEl = $('#stage-hero');
    if (!heroEl || saveData) return;
    import('/assets/scene.js?v=1').then(function (m) { boot(m, heroEl, $('#stage-steps')); }).catch(function () { /* repli : l'illustration reste affichée */ });
  }
  onLoad(function () {
    var go = function () { setTimeout(start3D, 400); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
  });

  function boot(m, heroEl, stepsEl) {
    var sc;
    try { sc = m.createScene({ lite: lite, onLost: onLost }); } catch (err) { return; }
    /* Contexte WebGL obtenu : la mise en page des étapes passe en « scène collante » ; les positions de défilement sont recalculées après */
    root.classList.add('has-3d');

    var stages = [];
    function mkStage(el, state) {
      var st = { el: el, slot: $('.stage-canvas', el), state: state, ratio: 0, split: $('.split', el), lastPct: -1, lastV: -1 };
      st.tag = $('.stage-tag', el); st.chipL = $('.chip-l', el); st.chipR = $('.chip-r', el);
      stages.push(st); return st;
    }
    var hero = mkStage(heroEl, { az: -26, el: 7, dist: 1.12, ty: -0.9, split: 0.5, retro: 0, spin: 5, parX: 0, parY: 0 });
    var steps = null;
    if (stepsEl && mq('(min-width: 921px)')) steps = mkStage(stepsEl, { az: STEP_VIEWS[0].az, el: 8, dist: 1.08, ty: 0, split: 1, retro: 0, spin: 0, parX: 0, parY: 0 });

    var current = null;
    function activate(st) {
      if (current !== st) { current = st; sc.setState(st.state); sc.attach(st.slot); }
      if (!st.el.classList.contains('on')) { st.el.classList.add('on'); }
      root.classList.add('has-3d');
      sc.start();
    }
    function choose() {
      var best = null;
      stages.forEach(function (s) { if (s.ratio > 0.06 && (!best || s.ratio > best.ratio)) best = s; });
      if (best) activate(best); else { sc.stop(); current = null; }
    }
    if (!('IntersectionObserver' in window)) { activate(hero); } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { stages.forEach(function (s) { if (s.el === e.target) s.ratio = e.isIntersecting ? e.intersectionRatio : 0; }); });
        choose();
      }, { threshold: [0, 0.06, 0.15, 0.3, 0.5, 0.75, 1] });
      stages.forEach(function (s) { io.observe(s.el); });
    }

    /* Mise à jour des éléments d'interface à chaque image */
    sc.onFrame = function (S) {
      var st = current; if (!st) return;
      var pct = clamp(S.split, 0, 1) * 100;
      if (st.split && Math.abs(pct - st.lastPct) > 0.04) {
        st.lastPct = pct; st.split.style.left = pct + '%';
        st.split.style.opacity = (pct < 3 || pct > 97) && st !== hero ? '0' : '1';
        var v = Math.round(pct);
        if (v !== st.lastV) { st.lastV = v; if (st === hero) st.split.setAttribute('aria-valuenow', String(v)); }
        if (st.chipL) st.chipL.style.opacity = pct < 16 ? '0' : '1';
        if (st.chipR) st.chipR.style.opacity = pct > 84 ? '0' : '1';
      }
    };

    /* ---- Hero : séparation glissante, parallaxe, rotation douce ---- */
    var HS = hero.state, handle = hero.split, hint = $('.stage-hint', heroEl), card = $('.float-card', heroEl);
    var splitTo = gsap.quickTo(HS, 'split', { duration: 0.4, ease: 'power3.out' });
    var parXTo = gsap.quickTo(HS, 'parX', { duration: 0.9, ease: 'power3.out' });
    var parYTo = gsap.quickTo(HS, 'parY', { duration: 0.9, ease: 'power3.out' });
    var cxTo = card ? gsap.quickTo(card, 'x', { duration: 0.9, ease: 'power3.out' }) : null;
    var cyTo = card ? gsap.quickTo(card, 'y', { duration: 0.9, ease: 'power3.out' }) : null;
    var dragging = false, touched = false;
    function sawIt() { if (!touched) { touched = true; if (hint) hint.classList.add('gone'); } }
    function setSplitFromX(clientX, smooth) {
      var r = heroEl.getBoundingClientRect();
      var v = clamp((clientX - r.left) / r.width, 0.04, 0.96);
      if (smooth) splitTo(v); else { gsap.killTweensOf(HS, 'split'); HS.split = v; }
    }
    heroEl.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = heroEl.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      parXTo(nx * 8); parYTo(-ny * 3);
      if (cxTo) { cxTo(nx * -16); cyTo(ny * -12); }
      if (!dragging) { setSplitFromX(e.clientX, true); sawIt(); }
    });
    heroEl.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') gsap.to(HS, { spin: 1.5, duration: 1.2 }); });
    heroEl.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      gsap.to(HS, { spin: 5, duration: 1.4 }); parXTo(0); parYTo(0); if (cxTo) { cxTo(0); cyTo(0); }
    });
    if (handle) {
      handle.addEventListener('pointerdown', function (e) {
        dragging = true; sawIt(); handle.classList.add('drag');
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
        setSplitFromX(e.clientX, false); e.preventDefault();
      });
      handle.addEventListener('pointermove', function (e) { if (dragging) setSplitFromX(e.clientX, false); });
      var end = function () { dragging = false; handle.classList.remove('drag'); };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
      handle.addEventListener('keydown', function (e) {
        var d = 0, big = e.shiftKey ? 0.12 : 0.04;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -big;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = big;
        else if (e.key === 'Home') { HS.split = 0.04; sawIt(); e.preventDefault(); return; }
        else if (e.key === 'End') { HS.split = 0.96; sawIt(); e.preventDefault(); return; }
        if (d) { sawIt(); splitTo(clamp(HS.split + d, 0.04, 0.96)); e.preventDefault(); }
      });
    }

    /* ---- Étapes « Comment ça marche » : la caméra suit l'étape active ---- */
    if (steps) {
      var items = $$('.steps-layout .step');
      var goStep = function (i, instant) {
        var v = STEP_VIEWS[i];
        gsap.to(steps.state, Object.assign({ duration: instant ? 0 : 1.8, ease: 'power3.inOut', overwrite: 'auto' }, v));
        items.forEach(function (li, k) { li.classList.toggle('is-active', k === i); });
        if (steps.tag) steps.tag.textContent = STEP_TAGS[i];
        steps.el.setAttribute('data-step', String(i));
      };
      items.forEach(function (li, i) {
        ScrollTrigger.create({ trigger: li, start: 'top 62%', end: 'bottom 62%', onToggle: function (s) { if (s.isActive) goStep(i); } });
      });
      goStep(0, true);
    }

    function onLost() { root.classList.remove('has-3d'); stages.forEach(function (s) { s.el.classList.remove('on'); }); sc.stop(); ScrollTrigger.refresh(); }
    window.addEventListener('resize', function () { sc.resize(); ScrollTrigger.refresh(); });
    ScrollTrigger.refresh();
  }
})();
