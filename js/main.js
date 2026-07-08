/* ============================================================
   ŚWIAT PERGOLI — interakcje
   preloader · smooth scroll · reveal · oferta pozioma ·
   konfigurator · menu · parallax · formularz
   ============================================================ */
(() => {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ---------- Preloader ---------- */
  const preloader = $('#preloader');
  const finishLoading = () => {
    document.body.classList.add('is-loaded');
    document.body.classList.remove('is-locked');
    if (!preloader) return;
    preloader.classList.add('is-done');
    setTimeout(() => preloader.classList.add('is-gone'), 1300);
  };
  if (prefersReduced || sessionStorage.getItem('sp-seen')) {
    if (preloader) preloader.classList.add('is-gone');
    document.body.classList.add('is-loaded');
  } else {
    document.body.classList.add('is-locked');
    sessionStorage.setItem('sp-seen', '1');
    window.addEventListener('load', () => setTimeout(finishLoading, 1500));
    setTimeout(finishLoading, 4200); // bezpiecznik, gdyby load nie nadszedł
  }

  /* ---------- Smooth scroll (lerp, desktop) ---------- */
  const smoothOn = finePointer && !prefersReduced && window.innerWidth > 900;
  let target = window.scrollY;
  let current = window.scrollY;
  let rafId = null;
  let animating = false;

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

  const loop = () => {
    current += (target - current) * 0.09;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      animating = false;
      window.scrollTo(0, current);
      rafId = null;
      return;
    }
    animating = true;
    window.scrollTo(0, Math.round(current));
    rafId = requestAnimationFrame(loop);
  };
  const startLoop = () => { if (!rafId) rafId = requestAnimationFrame(loop); };

  if (smoothOn) {
    document.documentElement.classList.add('has-smooth');
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return; // zoom
      if (e.target.closest && e.target.closest('[data-lenis-prevent]')) return; // konfigurator 3D: zoom modelu
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      target = clamp(target + delta, 0, maxScroll());
      startLoop();
    }, { passive: false });
    // klawiatura / pasek przewijania: synchronizuj cel
    window.addEventListener('scroll', () => {
      if (!animating) { target = window.scrollY; current = window.scrollY; }
    }, { passive: true });
  }

  const scrollToY = (y) => {
    y = clamp(y, 0, maxScroll());
    if (smoothOn) { target = y; startLoop(); }
    else window.scrollTo({ top: y, behavior: prefersReduced ? 'auto' : 'smooth' });
  };

  /* ---------- Kotwice ---------- */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      closeMenu();
      const top = el.getBoundingClientRect().top + window.scrollY;
      scrollToY(top);
      history.pushState(null, '', id);
    });
  });

  /* ---------- Header: chowanie przy scrollu ---------- */
  const header = $('#header');
  let lastY = window.scrollY;
  const onHeaderScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 40);
    if (y > 500 && y > lastY + 4) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y < 500) header.classList.remove('is-hidden');
    lastY = y;
  };

  /* ---------- Mobile menu ---------- */
  const menuToggle = $('#menuToggle');
  const mobileMenu = $('#mobileMenu');
  const openMenu = () => {
    mobileMenu.classList.add('is-open');
    header.classList.add('menu-open');
    menuToggle.classList.add('is-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Zamknij menu');
    mobileMenu.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
  };
  function closeMenu() {
    if (!mobileMenu.classList.contains('is-open')) return;
    mobileMenu.classList.remove('is-open');
    header.classList.remove('menu-open');
    menuToggle.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Otwórz menu');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  }
  menuToggle.addEventListener('click', () =>
    mobileMenu.classList.contains('is-open') ? closeMenu() : openMenu());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ---------- Scroll reveal ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReduced) {
    // delikatny stagger w obrębie wspólnego rodzica
    const groups = new Map();
    revealEls.forEach((el) => {
      const p = el.parentElement;
      const i = groups.get(p) || 0;
      el.style.setProperty('--rd', `${Math.min(i * 0.09, 0.45)}s`);
      groups.set(p, i + 1);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Parallax: hero + sekcja emocjonalna ---------- */
  const heroMedia = $('#heroMedia');
  const emotionMedia = $('#emotionMedia');
  const emotionSection = emotionMedia ? emotionMedia.closest('.emotion') : null;
  const onParallax = () => {
    if (prefersReduced) return;
    const y = window.scrollY;
    if (heroMedia && y < window.innerHeight * 1.2) {
      const p = y / window.innerHeight;
      heroMedia.style.transform = `translateY(${y * 0.32}px) scale(${1 + p * 0.06})`;
    }
    if (emotionSection) {
      const r = emotionSection.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        const p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
        emotionMedia.style.transform = `translateY(${(p - 0.5) * 90}px)`;
      }
    }
  };

  /* ---------- Oferta: pionowa galeria ----------
     Karty odsłaniają się przez IntersectionObserver ([data-reveal] →
     .is-visible) i CSS (kurtyna clip-path + wjazd tytułu). Zwykły pionowy
     scroll strony — nic tu nie przechwytuje scrolla, więc desktop i mobile
     zachowują się tak samo. */

  /* ---------- Tilt 3D: karty realizacji (desktop) ---------- */
  if (finePointer && !prefersReduced) {
    $$('.work').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- Formularz (bez backendu: mailto) ---------- */
  const form = $('#contactForm');
  const formStatus = $('#formStatus');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const contact = (data.get('contact') || '').toString().trim();
      if (!name || !contact) {
        formStatus.textContent = 'Uzupełnij imię oraz telefon lub e-mail.';
        return;
      }
      const body = [
        `Imię i nazwisko: ${name}`,
        `Kontakt: ${contact}`,
        `Miejscowość: ${data.get('place') || '—'}`,
        '',
        `${data.get('message') || ''}`,
      ].join('\n');
      const href = `mailto:kontakt@swiatpergoli.com?subject=${encodeURIComponent('Zapytanie o ofertę — ' + name)}&body=${encodeURIComponent(body)}`;
      window.location.href = href;
      formStatus.textContent = 'Dziękujemy. Otwieramy Twój program pocztowy z gotową wiadomością.';
    });
  }

  /* ---------- Pętla zdarzeń scroll/resize ---------- */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onHeaderScroll();
      onParallax();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
