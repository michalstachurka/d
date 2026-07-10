import { ARAssetManager } from "./ar-export.js";

const UNSUPPORTED_MESSAGE = "Tryb AR nie jest obsługiwany na tym urządzeniu lub w tej przeglądarce. Otwórz stronę w aktualnym Chrome na telefonie obsługującym AR.";
const IOS_UNSUPPORTED_MESSAGE = "Tryb AR nie jest obsługiwany w tej przeglądarce. Otwórz stronę w Safari na iPhonie lub iPadzie obsługującym Apple Quick Look.";

const detectPlatform = () => {
  const ua = navigator.userAgent || "";
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(ua) || iPadOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};

const supportsWebXR = async () => {
  if (!navigator.xr?.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch (_) {
    return false;
  }
};

const supportsQuickLook = () => {
  try {
    const anchor = document.createElement("a");
    return Boolean(anchor.relList?.supports?.("ar"));
  } catch (_) {
    return false;
  }
};

const waitForModelViewer = () => Promise.race([
  customElements.whenDefined("model-viewer"),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Nie udało się załadować model-viewer.")), 12000)),
]);

const waitForModel = (viewer) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => finish(new Error("Podgląd modelu nie odpowiedział na czas.")), 18000);
  const onLoad = () => finish();
  const onError = () => finish(new Error("Nie udało się wczytać wyeksportowanego modelu."));
  const finish = (error) => {
    clearTimeout(timer);
    viewer.removeEventListener("load", onLoad);
    viewer.removeEventListener("error", onError);
    error ? reject(error) : resolve();
  };
  viewer.addEventListener("load", onLoad, { once: true });
  viewer.addEventListener("error", onError, { once: true });
});

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function setupPergolaAR({ canvas, closeOptionsPanel }) {
  const openButton = document.getElementById("pergolaAR");
  const modal = document.getElementById("arModal");
  const dialog = modal?.querySelector("[role='dialog']");
  const viewer = document.getElementById("arModelViewer");
  const loader = document.getElementById("arLoader");
  const status = document.getElementById("arStatus");
  const info = document.getElementById("arInfo");
  const unsupported = document.getElementById("arUnsupported");
  const errorMessage = document.getElementById("arError");
  const launchButton = document.getElementById("arLaunch");
  const closeButtons = modal ? [...modal.querySelectorAll("[data-ar-close]")] : [];
  const debugPanel = document.getElementById("arDebug");
  const download = document.getElementById("arDownloadGLB");
  if (!openButton || !modal || !dialog || !viewer || !loader || !status || !launchButton) return;

  const debugEnabled = new URLSearchParams(window.location.search).get("debugAR") === "1";
  const platform = detectPlatform();
  const assets = new ARAssetManager();
  let currentAssets = null;
  let isOpen = false;
  let preparing = false;
  let session = 0;
  let lastFocus = null;

  const debugFields = debugPanel
    ? Object.fromEntries([...debugPanel.querySelectorAll("[data-ar-debug]")].map((el) => [el.dataset.arDebug, el]))
    : {};
  if (debugPanel) debugPanel.hidden = !debugEnabled;

  const setDebug = (key, value) => {
    if (debugEnabled && debugFields[key]) debugFields[key].textContent = value;
  };

  const platformLabel = {
    ios: "iOS / iPadOS",
    android: "Android",
    desktop: "komputer (podgląd 3D)",
  }[platform];

  const resetMessages = () => {
    loader.hidden = false;
    status.textContent = "Przygotowuję model AR...";
    info.hidden = true;
    unsupported.hidden = true;
    errorMessage.hidden = true;
    errorMessage.textContent = "";
    launchButton.disabled = true;
    viewer.classList.remove("is-ready");
  };

  const showUnsupported = () => {
    unsupported.textContent = platform === "ios" ? IOS_UNSUPPORTED_MESSAGE : UNSUPPORTED_MESSAGE;
    unsupported.hidden = false;
    launchButton.disabled = true;
  };

  const cleanupViewer = () => {
    viewer.src = "";
    if ("iosSrc" in viewer) viewer.iosSrc = null;
    viewer.removeAttribute("src");
    viewer.removeAttribute("ios-src");
    viewer.classList.remove("is-ready");
    if (download) download.removeAttribute("href");
    currentAssets = null;
    assets.clear();
  };

  const close = () => {
    if (!isOpen) return;
    session += 1;
    isOpen = false;
    preparing = false;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    openButton.classList.remove("is-busy");
    openButton.disabled = false;
    cleanupViewer();
    setTimeout(() => {
      if (!isOpen) modal.hidden = true;
    }, 260);
    if (lastFocus?.focus) lastFocus.focus({ preventScroll: true });
  };

  const updateDebug = ({ generated, webxr, method }) => {
    const metrics = generated.metrics;
    setDebug("width", `${metrics.width.toFixed(3)} m`);
    setDebug("depth", `${metrics.depth.toFixed(3)} m`);
    setDebug("height", `${metrics.height.toFixed(3)} m`);
    setDebug("minY", `${metrics.minY.toFixed(6)} m`);
    setDebug("objects", String(metrics.objectCount));
    setDebug("glb", formatBytes(generated.glb.size));
    setDebug("usdz", generated.usdz ? formatBytes(generated.usdz.size) : "nie generowano");
    setDebug("platform", platformLabel);
    setDebug("webxr", webxr ? "dostępny" : "niedostępny");
    setDebug("method", method);
    if (download) {
      download.href = generated.glbUrl;
      download.download = "pergola-konfiguracja.glb";
    }
  };

  const open = async () => {
    if (preparing || isOpen) return;
    preparing = true;
    isOpen = true;
    const thisSession = ++session;
    lastFocus = document.activeElement;
    openButton.classList.add("is-busy");
    openButton.disabled = true;
    closeOptionsPanel?.();
    resetMessages();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    setTimeout(() => dialog.focus({ preventScroll: true }), 30);

    setDebug("platform", platformLabel);
    setDebug("webxr", "sprawdzanie...");
    setDebug("method", "przygotowywanie");

    const webxrPromise = supportsWebXR();
    try {
      await waitForModelViewer();
      const root = canvas.createExportClone();
      // W debugAR generujemy także USDZ na desktopie, aby dało się zweryfikować
      // i pobrać statystyki ścieżki iOS bez udawania testu na fizycznym iPhonie.
      const generated = await assets.generate(root, { includeUSDZ: platform === "ios" || debugEnabled });
      const webxr = await webxrPromise;
      if (!isOpen || thisSession !== session) return;

      currentAssets = generated;
      const method = platform === "ios"
        ? "Apple Quick Look (USDZ)"
        : platform === "android" && webxr
          ? "WebXR (model-viewer)"
          : platform === "desktop"
            ? "podgląd GLB"
            : "brak obsługi AR";
      updateDebug({ generated, webxr, method });

      const modelReady = waitForModel(viewer);
      viewer.src = generated.glbUrl;
      if (generated.usdzUrl) viewer.setAttribute("ios-src", generated.usdzUrl);
      await modelReady;
      if (!isOpen || thisSession !== session) return;

      loader.hidden = true;
      viewer.classList.add("is-ready");
      preparing = false;
      openButton.classList.remove("is-busy");

      if (platform === "desktop") {
        info.textContent = "To jest podgląd wyeksportowanego modelu. Tryb AR otwórz na obsługiwanym telefonie.";
        info.hidden = false;
      } else if (platform === "ios" && !supportsQuickLook()) {
        showUnsupported();
      } else if (platform === "android" && !webxr) {
        showUnsupported();
      } else {
        info.textContent = platform === "ios"
          ? "Model jest gotowy. Uruchom Apple Quick Look, aby ustawić pergolę w ogrodzie."
          : "Model jest gotowy. Dostępność i jakość WebXR zależy od telefonu oraz aktualnej wersji Chrome.";
        info.hidden = false;
        launchButton.disabled = false;
      }
    } catch (error) {
      if (!isOpen || thisSession !== session || error?.name === "AbortError") return;
      preparing = false;
      loader.hidden = true;
      errorMessage.textContent = "Nie udało się przygotować modelu AR. Zamknij panel i spróbuj ponownie.";
      errorMessage.hidden = false;
      launchButton.disabled = true;
      openButton.classList.remove("is-busy");
      if (debugEnabled) setDebug("method", `błąd: ${error?.message || "nieznany"}`);
      console.error("AR export failed", error);
    }
  };

  launchButton.addEventListener("click", async () => {
    if (!currentAssets || launchButton.disabled) return;
    try {
      await viewer.activateAR();
    } catch (error) {
      showUnsupported();
      if (debugEnabled) setDebug("method", `błąd uruchomienia: ${error?.message || "nieznany"}`);
    }
  });

  viewer.addEventListener("ar-status", (event) => {
    if (event.detail?.status === "failed") showUnsupported();
  });

  openButton.addEventListener("click", open);
  closeButtons.forEach((button) => button.addEventListener("click", close));
  window.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
