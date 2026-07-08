// Konfigurator pergoli — warstwa UI (vanilla JS) spięta z silnikiem 3D
// z pergola-canvas.js. Kolejność kontrolek, kolejność kolorów i domyślne
// wartości zgodne z dostarczoną specyfikacją (PergolaConfigurator.tsx).
import { createPergolaCanvas } from "./pergola-canvas.js";

const mount = document.getElementById("pergolaMount");
if (mount) {
  const COLORS = [
    { id: "antracyt", label: "Antracyt", value: "#2b2d2e" },
    { id: "bialy", label: "Biały", value: "#e8e6e0" },
    { id: "czarny", label: "Czarny", value: "#0e0f10" },
    { id: "braz", label: "Brąz", value: "#4a3527" },
  ];

  // Kolory tkaniny screen (osobna paleta — barwy techniczne).
  const SCREEN_COLORS = [
    { id: "piaskowy", label: "Piaskowy", value: "#c9b79c" },
    { id: "grafit", label: "Grafit", value: "#55534e" },
    { id: "antracyt", label: "Antracyt", value: "#33352f" },
    { id: "ecru", label: "Ecru", value: "#ded7c7" },
  ];

  const SIDE_LABELS = { front: "Przód", back: "Tył", left: "Lewa", right: "Prawa" };
  const SIDES = ["front", "back", "left", "right"];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const state = {
    widths: [4],
    depth: 3.2,
    height: 2.6,
    angle: 35,
    frame: COLORS[0],
    slat: COLORS[0],
    ledLinear: false,
    ledSpots: false,
    screens: { front: false, back: false, left: false, right: false },
    screenFabric: SCREEN_COLORS[0],
    glass: { front: false, back: false, left: false, right: false },
    extraLegs: [], // dodatkowe nogi: [{x, z}] w metrach
    spin: true,
  };

  // Wczytanie konfiguracji z linku (?w=4-4&d=3.2&...&scr=bl&sf=grafit&gl=f).
  const applyFromURL = () => {
    const q = new URLSearchParams(window.location.search);
    if (![...q.keys()].length) return;
    const w = (q.get("w") || "").split("-").map(Number).filter((n) => n >= 2 && n <= 6).slice(0, 2);
    if (w.length) state.widths = w.map((n) => Math.round(n * 10) / 10);
    if (q.get("d")) state.depth = clamp(Number(q.get("d")), 2.5, 4.5);
    if (q.get("h")) state.height = clamp(Number(q.get("h")), 2.2, 3.2);
    if (q.get("a")) state.angle = clamp(Math.round(Number(q.get("a"))), 0, 120);
    const fc = COLORS.find((c) => c.id === q.get("fc")); if (fc) state.frame = fc;
    const sc = COLORS.find((c) => c.id === q.get("sc")); if (sc) state.slat = sc;
    const led = q.get("led") || "";
    state.ledLinear = led.includes("l"); state.ledSpots = led.includes("s");
    const scr = q.get("scr") || "";
    SIDES.forEach((s) => { state.screens[s] = scr.includes(s[0]); });
    const sf = SCREEN_COLORS.find((c) => c.id === q.get("sf")); if (sf) state.screenFabric = sf;
    const gl = q.get("gl") || "";
    SIDES.forEach((s) => { state.glass[s] = gl.includes(s[0]); });
    const lg = q.get("lg") || "";
    if (lg) {
      state.extraLegs = lg.split(";").map((pair) => {
        const [x, z] = pair.split("_").map(Number);
        return { x, z };
      }).filter((l) => Number.isFinite(l.x) && Number.isFinite(l.z)).slice(0, 12);
    }
  };
  applyFromURL();

  const params = () => ({
    widths: state.widths,
    depth: state.depth,
    height: state.height,
    slatAngle: state.angle,
    frameColor: state.frame.value,
    slatColor: state.slat.value,
    ledLinear: state.ledLinear,
    ledSpots: state.ledSpots,
    screens: { ...state.screens },
    screenColor: state.screenFabric.value,
    glass: { ...state.glass },
    extraLegs: state.extraLegs.map((l) => ({ ...l })),
    spin: state.spin,
  });

  // Zbudowanie linku do bieżącej konfiguracji.
  const encodeState = () => {
    const q = new URLSearchParams();
    q.set("w", state.widths.map((v) => v.toFixed(1)).join("-"));
    q.set("d", state.depth.toFixed(1));
    q.set("h", state.height.toFixed(2));
    q.set("a", String(state.angle));
    q.set("fc", state.frame.id);
    q.set("sc", state.slat.id);
    const led = (state.ledLinear ? "l" : "") + (state.ledSpots ? "s" : "");
    if (led) q.set("led", led);
    const scr = SIDES.filter((s) => state.screens[s]).map((s) => s[0]).join("");
    if (scr) { q.set("scr", scr); q.set("sf", state.screenFabric.id); }
    const gl = SIDES.filter((s) => state.glass[s]).map((s) => s[0]).join("");
    if (gl) q.set("gl", gl);
    if (state.extraLegs.length) {
      q.set("lg", state.extraLegs.map((l) => `${l.x.toFixed(2)}_${l.z.toFixed(2)}`).join(";"));
    }
    return `${window.location.origin}${window.location.pathname}?${q.toString()}#konfigurator-3d`;
  };

  const canvas = createPergolaCanvas(mount, params());
  mount.setAttribute("aria-busy", "false");

  const specEl = document.getElementById("pergolaSpec");
  const updateSpec = () => {
    specEl.textContent =
      `${state.widths.map((w) => w.toFixed(1)).join(" + ")} × ` +
      `${state.depth.toFixed(1)} × ${state.height.toFixed(1)} m · ${state.angle}°`;
  };

  const push = () => {
    canvas.update(params());
    updateSpec();
  };

  /* ---------- Moduły + suwaki szerokości ---------- */
  const modulesGroup = document.getElementById("pergolaModules");
  const widthsHost = document.getElementById("pergolaWidths");

  const renderWidths = () => {
    widthsHost.innerHTML = "";
    state.widths.forEach((w, i) => {
      const label = document.createElement("label");
      label.className = "pergola3d__slider";
      const labelText = state.widths.length === 1 ? "Szerokość" : `Moduł ${i + 1} · szerokość`;
      label.innerHTML = `
        <span class="pergola3d__label">${labelText} · <b>${w.toFixed(1)}</b> m</span>
        <input type="range" min="2" max="6" step="0.1" value="${w}">
      `;
      const input = label.querySelector("input");
      const b = label.querySelector("b");
      input.addEventListener("input", () => {
        state.widths[i] = Number(input.value);
        b.textContent = state.widths[i].toFixed(1);
        push();
      });
      widthsHost.appendChild(label);
    });
  };

  const syncModules = () => modulesGroup.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.modules) === state.widths.length)));
  modulesGroup.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = Number(btn.dataset.modules);
      if (m === state.widths.length) return;
      state.widths = m > state.widths.length ? [...state.widths, 4] : state.widths.slice(0, m);
      syncModules();
      renderWidths();
      push();
    });
  });
  renderWidths();
  syncModules();

  /* ---------- Wysięg / wysokość / kąt lameli ---------- */
  const bindSlider = (id, valId, key, decimals) => {
    const input = document.getElementById(id);
    const out = document.getElementById(valId);
    input.value = state[key];
    out.textContent = decimals > 0 ? state[key].toFixed(decimals) : String(state[key]);
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      out.textContent = decimals > 0 ? state[key].toFixed(decimals) : String(state[key]);
      push();
    });
  };
  bindSlider("pergolaDepth", "pergolaDepthVal", "depth", 1);
  bindSlider("pergolaHeight", "pergolaHeightVal", "height", 2);
  bindSlider("pergolaAngle", "pergolaAngleVal", "angle", 0);

  /* ---------- Kolory: konstrukcja + lamele ---------- */
  const renderSwatches = (hostId, key) => {
    const host = document.getElementById(hostId);
    host.innerHTML = COLORS.map((c) => `
      <button type="button" data-id="${c.id}" aria-pressed="${state[key].id === c.id}">
        <i style="--sw:${c.value}"></i><span>${c.label}</span>
      </button>
    `).join("");
    host.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const color = COLORS.find((c) => c.id === btn.dataset.id);
        state[key] = color;
        host.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        push();
      });
    });
  };
  renderSwatches("pergolaFrameColor", "frame");
  renderSwatches("pergolaSlatColor", "slat");

  /* ---------- LED (można łączyć) ---------- */
  const bindToggle = (id, key) => {
    const btn = document.getElementById(id);
    btn.addEventListener("click", () => {
      state[key] = !state[key];
      btn.setAttribute("aria-pressed", String(state[key]));
      push();
    });
  };
  bindToggle("pergolaLedLinear", "ledLinear");
  bindToggle("pergolaLedSpots", "ledSpots");
  document.getElementById("pergolaLedLinear").setAttribute("aria-pressed", String(state.ledLinear));
  document.getElementById("pergolaLedSpots").setAttribute("aria-pressed", String(state.ledSpots));

  /* ---------- Rolety screen: boki + kolor tkaniny ---------- */
  const screensGroup = document.getElementById("pergolaScreens");
  screensGroup.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(state.screens[btn.dataset.side]));
    btn.addEventListener("click", () => {
      const side = btn.dataset.side;
      state.screens[side] = !state.screens[side];
      btn.setAttribute("aria-pressed", String(state.screens[side]));
      push();
    });
  });

  const screenColorHost = document.getElementById("pergolaScreenColor");
  screenColorHost.innerHTML = SCREEN_COLORS.map((c) => `
    <button type="button" data-id="${c.id}" aria-pressed="${state.screenFabric.id === c.id}">
      <i style="--sw:${c.value}"></i><span>${c.label}</span>
    </button>
  `).join("");
  screenColorHost.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.screenFabric = SCREEN_COLORS.find((c) => c.id === btn.dataset.id);
      screenColorHost.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      push();
    });
  });

  /* ---------- Przeszklenia: boki ---------- */
  const glassGroup = document.getElementById("pergolaGlass");
  glassGroup.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(state.glass[btn.dataset.side]));
    btn.addEventListener("click", () => {
      const side = btn.dataset.side;
      state.glass[side] = !state.glass[side];
      btn.setAttribute("aria-pressed", String(state.glass[side]));
      push();
    });
  });

  /* ---------- Animacja ruchu (domyślnie włączona) ---------- */
  const spinBtn = document.getElementById("pergolaSpin");
  spinBtn.addEventListener("click", () => {
    state.spin = !state.spin;
    spinBtn.setAttribute("aria-pressed", String(state.spin));
    push();
  });

  updateSpec();

  /* ---------- Mobile: panel opcji jako wysuwany bottom sheet ---------- */
  const toggleBtn = document.getElementById("pergolaOptionsToggle");
  const panel = document.getElementById("pergolaPanel");
  const closeBtn = document.getElementById("pergolaPanelClose");
  const scrim = document.getElementById("pergolaScrim");
  const stage = document.querySelector(".pergola3d__stage");

  const openPanel = () => {
    panel.classList.add("is-open");
    scrim.classList.add("is-open");
    toggleBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
    // Render musi zostać w całości widoczny nad panelem (max 45vh) —
    // dosuwamy stronę tak, by kadr 3D zmieścił się w wolnej przestrzeni.
    const sheetHeight = window.innerHeight * 0.45;
    const available = window.innerHeight - sheetHeight;
    const headerSafe = 84;
    const rect = stage.getBoundingClientRect();
    if (rect.bottom > available || rect.top < headerSafe) {
      const targetTop = Math.max(headerSafe, available - rect.height);
      window.scrollBy({ top: rect.top - targetTop, behavior: "smooth" });
    }
  };
  const closePanel = () => {
    panel.classList.remove("is-open");
    scrim.classList.remove("is-open");
    toggleBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
  };
  toggleBtn.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);

  /* ---------- Dodatkowe nogi (wskazywane kliknięciem na modelu) ---------- */
  const addLegBtn = document.getElementById("pergolaAddLeg");
  const clearLegsBtn = document.getElementById("pergolaClearLegs");
  const legCountEl = document.getElementById("pergolaLegCount");
  const legHint = document.getElementById("pergolaLegHint");
  const POST = 0.14;
  const syncLegs = () => { legCountEl.textContent = String(state.extraLegs.length); };
  syncLegs();

  // Dosuń kliknięty punkt do najbliższej krawędzi obrysu (nogi wspierają belkę).
  const snapLeg = (x, z) => {
    const totalW = state.widths.reduce((a, b) => a + b, 0);
    const halfW = totalW / 2, halfD = state.depth / 2;
    const dEdgeX = Math.min(Math.abs(x - halfW), Math.abs(x + halfW));
    const dEdgeZ = Math.min(Math.abs(z - halfD), Math.abs(z + halfD));
    if (dEdgeX < dEdgeZ) {
      return { x: x > 0 ? halfW - POST / 2 : -halfW + POST / 2, z: clamp(z, -halfD + POST, halfD - POST) };
    }
    return { x: clamp(x, -halfW + POST, halfW - POST), z: z > 0 ? halfD - POST / 2 : -halfD + POST / 2 };
  };
  const stopPlacement = () => {
    canvas.setPlacement(null);
    addLegBtn.setAttribute("aria-pressed", "false");
    legHint.hidden = true;
  };
  const onPlace = (rawX, rawZ) => {
    const totalW = state.widths.reduce((a, b) => a + b, 0);
    if (Math.abs(rawX) > totalW / 2 + 1.2 || Math.abs(rawZ) > state.depth / 2 + 1.2) return;
    const leg = snapLeg(rawX, rawZ);
    const idx = state.extraLegs.findIndex((l) => Math.hypot(l.x - leg.x, l.z - leg.z) < 0.35);
    if (idx >= 0) state.extraLegs.splice(idx, 1); // klik w istniejącą nogę → usuń
    else if (state.extraLegs.length < 12) state.extraLegs.push(leg);
    syncLegs();
    push();
  };
  addLegBtn.addEventListener("click", () => {
    if (addLegBtn.getAttribute("aria-pressed") === "true") { stopPlacement(); return; }
    addLegBtn.setAttribute("aria-pressed", "true");
    legHint.hidden = false;
    canvas.setPlacement(onPlace);
    closePanel(); // na mobile odsłoń model do klikania
  });
  clearLegsBtn.addEventListener("click", () => {
    state.extraLegs = [];
    syncLegs();
    push();
  });

  /* ---------- Eksport PDF projektu ---------- */
  const exportBtn = document.getElementById("pergolaExport");
  const doc = {
    date: document.getElementById("pergolaDocDate"),
    render: document.getElementById("pergolaDocRender"),
    title: document.getElementById("pergolaDocTitle"),
    spec: document.getElementById("pergolaDocSpec"),
    table: document.getElementById("pergolaDocTable"),
  };

  const ledLabel = () => {
    if (state.ledLinear && state.ledSpots) return "Liniowe (rynny) + punktowe (lamele)";
    if (state.ledLinear) return "Liniowe (rynny)";
    if (state.ledSpots) return "Punktowe (lamele)";
    return "Bez oświetlenia";
  };

  const screensLabel = () => {
    const on = SIDES.filter((s) => state.screens[s]);
    if (!on.length) return "Bez rolet";
    const sides = on.map((s) => SIDE_LABELS[s]).join(", ");
    return `${sides} · skrzynka 10,5 cm · tkanina ${state.screenFabric.label}`;
  };

  const glassLabel = () => {
    const on = SIDES.filter((s) => state.glass[s]);
    if (!on.length) return "Bez przeszkleń";
    return on.map((s) => SIDE_LABELS[s]).join(", ");
  };

  const specLine = () =>
    `${state.widths.map((w) => w.toFixed(1)).join(" + ")} × ` +
    `${state.depth.toFixed(1)} × ${state.height.toFixed(1)} m · ${state.angle}°`;

  const fillDoc = () => {
    doc.date.textContent = new Date().toLocaleDateString("pl-PL", {
      day: "numeric", month: "long", year: "numeric",
    });
    doc.spec.textContent = specLine();
    const totalW = state.widths.reduce((a, b) => a + b, 0).toFixed(1);
    const rows = [
      ["Moduły", state.widths.length === 1 ? "1 moduł" : `${state.widths.length} moduły`],
      ["Szerokość" + (state.widths.length > 1 ? " (moduły)" : ""),
        state.widths.length > 1
          ? `${state.widths.map((w) => w.toFixed(1)).join(" + ")} m  ·  razem ${totalW} m`
          : `${state.widths[0].toFixed(1)} m`],
      ["Wysięg (głębokość)", `${state.depth.toFixed(1)} m`],
      ["Wysokość", `${state.height.toFixed(2)} m`],
      ["Otwarcie lameli", `${state.angle}°`],
      ["Kolor konstrukcji", state.frame.label],
      ["Kolor lameli", state.slat.label],
      ["Oświetlenie LED", ledLabel()],
      ["Rolety screen", screensLabel()],
      ["Przeszklenia", glassLabel()],
      ["Dodatkowe nogi", state.extraLegs.length ? `${state.extraLegs.length} szt.` : "Standard (bez dodatkowych)"],
    ];
    doc.table.innerHTML = rows
      .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
      .join("");
  };

  if (exportBtn) {
    let printing = false;
    // „is-printing" na <body> włącza tryb karty projektu tylko w @media print,
    // więc na ekranie nic nie zmienia. Zdejmujemy je dopiero, gdy okno druku
    // faktycznie się zamknie — nie po sztywnym timerze, bo użytkownik może
    // trzymać otwarty podgląd wydruku dowolnie długo.
    const endPrint = () => document.body.classList.remove("is-printing");
    window.addEventListener("afterprint", endPrint);
    const mql = window.matchMedia && window.matchMedia("print");
    if (mql && mql.addEventListener) {
      mql.addEventListener("change", (e) => { if (!e.matches) endPrint(); });
    }

    exportBtn.addEventListener("click", async () => {
      if (printing) return;
      printing = true;
      exportBtn.classList.add("is-busy");
      try {
        fillDoc();
        doc.render.src = canvas.snapshot();
        // Poczekaj, aż obraz się zdekoduje, żeby nie trafił pusty na wydruk.
        if (doc.render.decode) {
          try { await doc.render.decode(); } catch (_) { /* i tak drukujemy */ }
        }
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch (_) { /* ignore */ }
        }
        closePanel();
        document.body.classList.add("is-printing");
        window.print();
      } finally {
        exportBtn.classList.remove("is-busy");
        printing = false;
      }
    });
  }

  /* ---------- Wyślij zapytanie z tą konfiguracją ---------- */
  const inquiryBtn = document.getElementById("pergolaInquiry");
  const contactForm = document.getElementById("contactForm");
  if (inquiryBtn && contactForm) {
    const configSummary = () => {
      const totalW = state.widths.reduce((a, b) => a + b, 0).toFixed(1);
      const lines = [
        "Zapytanie z konfiguratora 3D — moja pergola:",
        "",
        `• Moduły: ${state.widths.length === 1 ? "1 moduł" : state.widths.length + " moduły"}`,
        `• Szerokość: ${state.widths.map((w) => w.toFixed(1)).join(" + ")} m` +
          (state.widths.length > 1 ? ` (razem ${totalW} m)` : ""),
        `• Wysięg: ${state.depth.toFixed(1)} m`,
        `• Wysokość: ${state.height.toFixed(2)} m`,
        `• Otwarcie lameli: ${state.angle}°`,
        `• Kolor konstrukcji: ${state.frame.label}`,
        `• Kolor lameli: ${state.slat.label}`,
        `• Oświetlenie LED: ${ledLabel()}`,
        `• Rolety screen: ${screensLabel()}`,
        `• Przeszklenia: ${glassLabel()}`,
        `• Dodatkowe nogi: ${state.extraLegs.length ? state.extraLegs.length + " szt." : "brak"}`,
        "",
        `Link do projektu: ${encodeState()}`,
        "",
        "Proszę o kontakt i orientacyjną wycenę.",
      ];
      return lines.join("\n");
    };

    inquiryBtn.addEventListener("click", () => {
      const msg = contactForm.querySelector('[name="message"]');
      if (msg) msg.value = configSummary();
      closePanel();
      const kontakt = document.getElementById("kontakt");
      if (kontakt) {
        const top = kontakt.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: "smooth" });
      }
      // Po dojechaniu do formularza ustaw kursor w pierwszym polu.
      const nameField = contactForm.querySelector('[name="name"]');
      if (nameField) setTimeout(() => nameField.focus({ preventScroll: true }), 700);
    });
  }

  /* ---------- Skopiuj link do projektu ---------- */
  const copyBtn = document.getElementById("pergolaCopyLink");
  const copyLabel = document.getElementById("pergolaCopyLinkLabel");
  if (copyBtn && copyLabel) {
    const defaultLabel = copyLabel.textContent;
    let resetTimer = 0;
    const flash = (text, ok) => {
      copyLabel.textContent = text;
      copyBtn.classList.toggle("is-copied", ok);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copyLabel.textContent = defaultLabel;
        copyBtn.classList.remove("is-copied");
      }, 1800);
    };
    copyBtn.addEventListener("click", async () => {
      const link = encodeState();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(link);
        } else {
          const ta = document.createElement("textarea");
          ta.value = link;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        flash("Skopiowano link ✓", true);
      } catch (_) {
        // Ostateczny fallback — pokaż link do ręcznego skopiowania.
        window.prompt("Skopiuj link do projektu:", link);
        flash(defaultLabel, false);
      }
    });
  }
}
