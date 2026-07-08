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

  const state = {
    widths: [4],
    depth: 3.2,
    height: 2.6,
    angle: 35,
    frame: COLORS[0],
    slat: COLORS[0],
    ledLinear: false,
    ledSpots: false,
    spin: true,
  };

  const params = () => ({
    widths: state.widths,
    depth: state.depth,
    height: state.height,
    slatAngle: state.angle,
    frameColor: state.frame.value,
    slatColor: state.slat.value,
    ledLinear: state.ledLinear,
    ledSpots: state.ledSpots,
    spin: state.spin,
  });

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

  modulesGroup.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = Number(btn.dataset.modules);
      if (m === state.widths.length) return;
      state.widths = m > state.widths.length ? [...state.widths, 4] : state.widths.slice(0, m);
      modulesGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderWidths();
      push();
    });
  });
  renderWidths();

  /* ---------- Wysięg / wysokość / kąt lameli ---------- */
  const bindSlider = (id, valId, key, decimals) => {
    const input = document.getElementById(id);
    const out = document.getElementById(valId);
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
}
