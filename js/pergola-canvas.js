// Silnik 3D pergoli — port PergolaCanvas.tsx (React) na czysty moduł ES.
// Cała logika three.js (geometria, kamera, oświetlenie, animacja) jest
// przeniesiona bez zmian; usunięto wyłącznie opakowanie React
// (useRef/useEffect zastąpione zwykłymi zmiennymi domknięcia).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Soft radial ground shadow texture. */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(23,23,23,0.42)");
  g.addColorStop(1, "rgba(23,23,23,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** Delikatny splot tkaniny screen (mapa koloru): jasne tło z cienką, ciemniejszą
 *  siatką nitek. Mnożone przez kolor materiału daje wrażenie tkaniny, a nie
 *  gładkiej płyty. Krycie zapewnia sam materiał (bez dziur = z zewnątrz nie
 *  widać wnętrza). `strength` = kontrast siatki: strona wewnętrzna dostaje
 *  mocniejszy splot, żeby tkanina była czytelna także przy jasnych kolorach. */
function screenWeaveMap(strength = 0.16) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = `rgba(0,0,0,${strength})`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 32; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, 32);
    ctx.moveTo(0, i + 0.5); ctx.lineTo(32, i + 0.5);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(52, 34);
  return t;
}

/** Alfa splotu dla WEWNĘTRZNEJ strony screenu: nitki są kryjące (biel),
 *  a oczka między nimi przepuszczają widok (czerń). Z bliska widać splot,
 *  z dystansu uśrednia się do ~połowicznej przezierności — tkanina jest
 *  widoczna w swoim prawdziwym kolorze, ale prześwituje przez nią otoczenie. */
function screenMeshAlpha() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = "#ffffff";
  // Grubość nitek dobrana tak, by splot krył ~2/3 powierzchni: roleta od
  // środka jest wyraźnie widoczna w swoim kolorze, ale NIE kryje w pełni —
  // przez oczka prześwituje otoczenie (jak w realnym screenie ZIP).
  ctx.lineWidth = 1.8;
  for (let i = 0; i <= 32; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, 32);
    ctx.moveTo(0, i + 0.5); ctx.lineTo(32, i + 0.5);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(52, 34);
  return t;
}

/**
 * @param {HTMLElement} mountEl - kontener na canvas (wypełnia go 100%x100%)
 * @param {object} initialParams - PergolaParams
 * @returns {{ update(params: object): void, destroy(): void }}
 */
export function createPergolaCanvas(mountEl, initialParams) {
  const el = mountEl;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Interaktywny model 3D pergoli — przeciągnij, aby obrócić");
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.cursor = "grab";

  const stateRef = {
    group: undefined,
    material: undefined,
    slatMaterial: undefined,
    rebuild: undefined,
    controls: undefined,
    slats: undefined,
    lastDims: undefined,
    desiredRadius: undefined,
  };
  let paramsRef = initialParams;

  // preserveDrawingBuffer pozwala odczytać kadr przez toDataURL() (eksport
  // PDF) — nie zmienia renderu ani zachowania modelu.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // Światło wypełniające. Kolor „ziemi" (dolny) rozjaśnia powierzchnie
  // zwrócone w dół — spód lameli — żeby przy niskim ujęciu kamery pokazywał
  // rzeczywisty kolor materiału, a nie wychodził czarny.
  scene.add(new THREE.HemisphereLight("#f4f1ea", "#cdc6b8", 0.9));
  // Miękki ambient dodatkowo podnosi najciemniejsze, odwrócone od światła
  // faktury (spód lameli), bez spłaszczania całości.
  scene.add(new THREE.AmbientLight("#ffffff", 0.22));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(6.4, 0.95, 7.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  // Mały minimalny dystans pozwala wjechać kamerą DO ŚRODKA pergoli
  // (np. żeby obejrzeć rolety screen od wewnątrz przy zamkniętych bokach).
  controls.minDistance = 0.7;
  controls.maxDistance = 20;
  // Wheel zoom only after the user grabs the model. The lenis-prevent
  // attribute is toggled together with it: unarmed, wheel events scroll
  // the page normally; armed, they zoom the model (and only the model).
  controls.enableZoom = false;
  const armZoom = () => {
    controls.enableZoom = true;
    el.setAttribute("data-lenis-prevent", "true");
  };
  const disarmZoom = () => {
    controls.enableZoom = false;
    el.removeAttribute("data-lenis-prevent");
  };
  el.addEventListener("pointerdown", armZoom);
  el.addEventListener("pointerleave", disarmZoom);

  // Tryb wskazywania miejsca (dodatkowa noga): pojedyncze kliknięcie bez
  // przeciągnięcia rzutuje promień na płaszczyznę podłoża i zwraca (x, z).
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let placementCb = null;
  let downPt = null;
  el.addEventListener("pointerdown", (e) => { downPt = { x: e.clientX, y: e.clientY }; });
  el.addEventListener("pointerup", (e) => {
    if (!placementCb || !downPt) return;
    const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
    downPt = null;
    if (moved > 6) return; // to był obrót, nie klik
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) placementCb(hit.x, hit.z);
  });
  const setPlacement = (cb) => {
    placementCb = cb || null;
    el.style.cursor = placementCb ? "crosshair" : "grab";
  };

  // Który bok pergoli jest zwrócony do kamery (do auto-ustawiania nogi).
  const getFacingSide = () => {
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    if (Math.abs(dz) >= Math.abs(dx)) return dz >= 0 ? "front" : "back";
    return dx >= 0 ? "right" : "left";
  };

  // Znormalizowany kierunek „od modelu do kamery" (do wygaszania znaczników
  // boków odwróconych od widza).
  const cameraDir = () => {
    const d = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    return { x: d.x, y: d.y, z: d.z };
  };

  // Rzut punktu 3D na piksele wewnątrz canvasu (do pozycjonowania strzałek).
  const project = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
      behind: v.z > 1,
    };
  };

  // Pauza auto-obrotu (np. gdy użytkownik ustawia nogę), bez zmiany
  // ustawienia „Animacja ruchu".
  let spinPaused = false;
  const setSpinPaused = (v) => { spinPaused = !!v; };

  // Callback wołany co klatkę (do przeliczania pozycji nakładki strzałek).
  let onFrame = null;
  const setOnFrame = (cb) => { onFrame = cb || null; };

  // Spokojniejszy, bardziej kontrolowany obrót przeciągnięciem
  controls.rotateSpeed = window.matchMedia("(pointer: coarse)").matches ? 0.9 : 0.55;
  // maxPolarAngle is managed per-frame in the render loop
  controls.target.set(0, 1.3, 0);
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.55;

  // Ground plane (receives the LED light pools) + soft contact shadow
  const alphaC = document.createElement("canvas");
  alphaC.width = alphaC.height = 256;
  {
    const cctx = alphaC.getContext("2d");
    const g = cctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.75, "#fff");
    g.addColorStop(1, "#000");
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, 256, 256);
  }
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshStandardMaterial({
      color: "#f1ede5", // matches the section backdrop, so no visible disc
      roughness: 0.96,
      metalness: 0,
      transparent: true,
      alphaMap: new THREE.CanvasTexture(alphaC),
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.002;
  scene.add(ground);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(shadow);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2b2d2e"),
    roughness: 0.55,
    metalness: 0.35,
  });
  const slatMaterial = material.clone();
  // Crisp cool-white LED, like real pergola strips
  // Widoczna geometria LED z prawdziwą emisją. Dzięki temu światło pozostaje
  // czytelne również po eksporcie do GLB/USDZ, gdzie lampy sceny są pomijane.
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: "#fff8e8",
    emissive: "#f2f6ff",
    emissiveIntensity: 3.2,
    roughness: 0.35,
    metalness: 0,
  });

  // Rolety screen — realny screen jest JEDNOKIERUNKOWY, ale nie „na wylot".
  // Dlatego każde płótno to DWIE nałożone warstwy renderowane tylko od czoła
  // (FrontSide, więc każda widoczna z jednej strony):
  //  • screenMaterial   — strona ZEWNĘTRZNA: pełne krycie (z zewnątrz nie widać
  //    wnętrza pergoli),
  //  • screenInnerMaterial — strona WEWNĘTRZNA: siatka z realnymi oczkami
  //    (alphaMap). Nitki są prawie kryjące i mają TEN SAM kolor tkaniny co
  //    strona zewnętrzna (spójny kolor rolety), a między nitkami prześwituje
  //    otoczenie — ze środka roleta jest widoczna, ale przezierna.
  // Splot (map) nadaje obu charakter tkaniny, a nie gładkiej płyty.
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c9b79c"),
    roughness: 0.92,
    metalness: 0,
    map: screenWeaveMap(),
    side: THREE.FrontSide,
  });
  // Matowa tkanina nie łapie odbić otoczenia — bez tego przy płaskim kącie
  // patrzenia fresnel rozjaśniał płótno i TEN SAM kolor wyglądał inaczej
  // z różnych ujęć kamery.
  screenMaterial.envMapIntensity = 0;
  // Lekka emisja w kolorze tkaniny podnosi jej jasność do poziomu próbnika
  // w panelu (tone mapping przyciemnia), jednakowo z każdego kąta.
  const SCREEN_GLOW = 0.28;
  screenMaterial.emissive.copy(screenMaterial.color).multiplyScalar(SCREEN_GLOW);
  const screenInnerMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c9b79c"),
    roughness: 0.92,
    metalness: 0,
    map: screenWeaveMap(0.42),
    alphaMap: screenMeshAlpha(),
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  // Strona wewnętrzna to strona ZACIENIONA (światło pada z zewnątrz), więc
  // tkanina od środka jest ciemniejsza od elewacyjnej — ten sam kolor,
  // przyciemniony. Dzięki temu roleta jest widoczna od środka nawet przy
  // jasnych tkaninach, a kolory obu stron pozostają spójne.
  const INNER_SHADE = 0.62;
  screenInnerMaterial.color.multiplyScalar(INNER_SHADE);
  screenInnerMaterial.envMapIntensity = 0;
  screenInnerMaterial.emissive.copy(screenInnerMaterial.color).multiplyScalar(SCREEN_GLOW);
  // Przeszklenia — tafla szkła: mocno przezroczysta, gładka, lekko chłodna.
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#cddfe6"),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  glassMaterial.envMapIntensity = 1.5;
  // Ściana (konstrukcja przyścienna) i opaska betonowa (moduł dachowy).
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#d9d3c7", roughness: 0.96, metalness: 0 });
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: "#c4bfb5", roughness: 0.9, metalness: 0 });
  // Postęp animacji opuszczania (0 = zwinięta u góry, 1 = w pełni opuszczona).
  // Trzymany poza rebuild(), żeby zmiany nie przerywały animacji.
  const screenAnim = { front: 0, back: 0, left: 0, right: 0 };
  const SCREEN_SIDES = ["front", "back", "left", "right"];

  let group = new THREE.Group();
  scene.add(group);

  const rebuild = (p) => {
    scene.remove(group);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Light) o.dispose();
    });
    group = new THREE.Group();
    group.name = "PergolaVisualRoot";
    const slats = [];

    const H = p.height;
    const post = 0.14;
    const beam = 0.18;
    const D = p.depth;
    const totalW = p.widths.reduce((a, b) => a + b, 0);

    const buildModule = (cx, W) => {
      const box = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(cx + x, y, z);
        group.add(m);
      };

      // Nogi budowane są globalnie po złożeniu modułów (patrz niżej), żeby
      // na styku dwóch modułów stała JEDNA wspólna noga, a nie dwie obok siebie.
      // Top frame
      box(W, beam, post, 0, H - beam / 2, -(D - post) / 2);
      box(W, beam, post, 0, H - beam / 2, (D - post) / 2);
      box(post, beam, D - 2 * post, -(W - post) / 2, H - beam / 2, 0);
      box(post, beam, D - 2 * post, (W - post) / 2, H - beam / 2, 0);

      // Linear LED: hairline strip along the inner bottom edge of the frame
      if (p.ledLinear) {
        const t = 0.012; // strip thickness — thin, crisp line
        const y = H - beam + t / 2;
        const inset = post * 0.55;
        const mk = (w, d, x, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), glowMaterial);
          m.name = "LED_Linear";
          m.position.set(cx + x, y, z);
          group.add(m);
        };
        mk(W - 2 * post, t, 0, -(D - post) / 2 + inset);
        mk(W - 2 * post, t, 0, (D - post) / 2 - inset);
        mk(t, D - 2 * post, -(W - post) / 2 + inset, 0);
        mk(t, D - 2 * post, (W - post) / 2 - inset, 0);
      }

      // Louvres (+ optional spots, ~1 per 1.5 m2)
      // Pitch == slat width, so closed louvres touch; at 90 deg the
      // 0.21 m blade stands proud of the 0.18 m collar
      const pitch = 0.21;
      const n = Math.max(3, Math.round((D - 2 * post) / pitch));
      const slatW = (D - 2 * post) / n;
      const span = W - 2 * post;

      let spotSlats = new Set();
      let spotsPerSlat = 0;
      if (p.ledSpots) {
        const target = Math.max(2, Math.round((W * D) / 1.5));
        const rows = Math.max(1, Math.round(Math.sqrt(target * (D / W))));
        spotsPerSlat = Math.max(1, Math.round(target / rows));
        const every = Math.max(1, Math.floor(n / rows));
        // skip the first/last louvre so spots never touch the frame
        for (let i = Math.max(1, Math.floor(every / 2)); i < n - 1; i += every)
          spotSlats.add(i);
      }

      for (let i = 0; i < n; i++) {
        const z = -(D - 2 * post) / 2 + (i + 0.5) * ((D - 2 * post) / n);
        const slat = new THREE.Mesh(new THREE.BoxGeometry(span, 0.015, slatW * 1.01), slatMaterial);
        slat.name = "RoofLouvre";
        slat.userData.arRole = "slat";
        slat.position.set(cx, H - beam / 2, z);
        slat.rotation.x = THREE.MathUtils.degToRad(p.slatAngle);
        group.add(slat);
        slats.push(slat);

        if (spotSlats.has(i)) {
          const margin = 0.4;
          const usable = span - 2 * margin;
          for (let k = 0; k < spotsPerSlat; k++) {
            const x = -usable / 2 + (spotsPerSlat === 1 ? usable / 2 : (k * usable) / (spotsPerSlat - 1));
            const dot = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0224, 0.0224, 0.01, 14),
              glowMaterial,
            );
            dot.name = "LED_Spot";
            // Child of the slat so spots tilt with the louvre (flush mount)
            dot.position.set(x, -0.01, 0);
            slat.add(dot);
          }
        }
      }
    };

    let acc = -totalW / 2;
    const centers = [];
    for (const w of p.widths) {
      centers.push(acc + w / 2);
      buildModule(acc + w / 2, w);
      acc += w;
    }

    // Nogi (słupy) — globalnie, po jednej na każdej krawędzi modułu. Na styku
    // dwóch modułów wypada jedna wspólna noga (nie dwie obok siebie).
    //  wolnostojąca: przód i tył · przyścienna: tylko przód (+z) · dachowy: brak.
    const zSides = p.construction === "roof" ? []
      : p.construction === "wall" ? [1]
      : [-1, 1];
    if (zSides.length) {
      const edges = [-totalW / 2];
      let ex = -totalW / 2;
      for (const w of p.widths) { ex += w; edges.push(ex); }
      const last = edges.length - 1;
      for (let j = 0; j < edges.length; j++) {
        // Skrajne słupy wsunięte o pół grubości do środka; wewnętrzne na styku.
        const px = j === 0 ? edges[0] + post / 2
          : j === last ? edges[last] - post / 2
          : edges[j];
        for (const sz of zSides) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(post, H, post), material);
          leg.position.set(px, H / 2, (sz * (D - post)) / 2);
          group.add(leg);
        }
      }
    }

    // Przyścienna — ściana z tyłu (−z), do której zamontowana jest pergola.
    if (p.construction === "wall") {
      const wallH = H + 0.7;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(totalW + 0.7, wallH, 0.12), wallMaterial);
      wall.position.set(0, wallH / 2, -D / 2 - 0.06);
      wall.name = "TechnicalWall";
      wall.userData.arExclude = true;
      group.add(wall);
    }
    // Moduł dachowy — opaska (kołnierz) betonowa wokół górnej ramy, bez nóg.
    if (p.construction === "roof") {
      const cw = 0.24, ch = 0.34;
      const yC = H - beam / 2;
      const collar = (w, d, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, ch, d), concreteMaterial);
        m.position.set(x, yC, z);
        m.name = "TechnicalRoofCollar";
        m.userData.arExclude = true;
        group.add(m);
      };
      const oW = totalW + 2 * cw;
      collar(oW, cw, 0, D / 2 + cw / 2);            // przód
      collar(oW, cw, 0, -D / 2 - cw / 2);           // tył
      collar(cw, D, -totalW / 2 - cw / 2, 0);       // lewy
      collar(cw, D, totalW / 2 + cw / 2, 0);        // prawy
    }

    // LEDs actually cast light: a soft pool on the ground under each module
    if (p.ledLinear || p.ledSpots) {
      const strength = (p.ledLinear ? 120 : 0) + (p.ledSpots ? 100 : 0);
      for (const cx of centers) {
        const sp = new THREE.SpotLight("#f2f6ff", strength, H * 5, 1.15, 0.7, 1.3);
        sp.position.set(cx, H - beam, 0);
        sp.target.position.set(cx, 0, 0);
        sp.userData.arExclude = true;
        sp.target.userData.arExclude = true;
        group.add(sp);
        group.add(sp.target);
      }
    }

    // Dodatkowe nogi pogrupowane wg boku (współrzędna wzdłuż danej ściany).
    // Noga dzieli roletę i przeszklenie na tym boku na osobne segmenty.
    const legsBySide = { front: [], back: [], left: [], right: [] };
    if (p.extraLegs) {
      for (const leg of p.extraLegs) {
        const s = leg.side;
        if (!s || !(s in legsBySide)) continue;
        legsBySide[s].push(s === "front" || s === "back" ? leg.x : leg.z);
      }
    }
    for (const s in legsBySide) legsBySide[s].sort((a, b) => a - b);

    // Podział przedziału [min,max] nogami na segmenty. Przy nodze segment cofa
    // się o pół grubości słupa, żeby zrobić miejsce na nogę (nie nachodzi na nią).
    const segmentsFor = (min, max, legs) => {
      const cuts = legs.filter((v) => v > min + 0.06 && v < max - 0.06);
      const bounds = [min, ...cuts, max];
      const segs = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const lo = bounds[i] + (i === 0 ? 0 : post / 2);
        const hi = bounds[i + 1] - (i === bounds.length - 2 ? 0 : post / 2);
        if (hi - lo > 0.08) segs.push({ center: (lo + hi) / 2, width: hi - lo });
      }
      return segs;
    };

    const screens = { front: [], back: [], left: [], right: [] };
    const screenBoxes = { front: [], back: [], left: [], right: [] };
    const screenBars = { front: [], back: [], left: [], right: [] };
    const screenGuides = { front: [], back: [], left: [], right: [] };
    const cassetteH = 0.105; // skrzynka rolety — 10,5 cm
    const fabricTop = H - beam - cassetteH; // płótno startuje od spodu skrzynki
    const inset = 0.02;
    // Obrót płótna tak, by FrontSide (normalna) patrzyła NA ZEWNĄTRZ pergoli.
    const OUT_ROT = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
    const mkScreen = (side, width, x, z) => {
      const rotY = OUT_ROT[side];
      const axisX = side === "front" || side === "back"; // szerokość biegnie po X
      const prog = Math.max(screenAnim[side], 0.0001);
      const vis = prog > 0.003;
      // skrzynka w kolorze konstrukcji, tuż pod belką
      const box = new THREE.Mesh(new THREE.BoxGeometry(width, cassetteH, 0.11), material);
      box.name = `ScreenCassette_${side}`;
      box.userData.arSide = side;
      box.position.set(x, H - beam - cassetteH / 2, z);
      box.rotation.y = rotY;
      box.visible = vis;
      group.add(box);
      screenBoxes[side].push(box);
      // płótno — grupa z dwiema warstwami: zewnętrzna kryjąca + wewnętrzna
      // półprzezroczysta (patrz komentarz przy materiałach). Pivot u góry:
      // skalowanie w osi Y „opuszcza"/„zwija" roletę.
      const geo = new THREE.PlaneGeometry(width, fabricTop, 1, 1);
      geo.translate(0, -fabricTop / 2, 0); // górna krawędź w local y = 0
      const grp = new THREE.Group();
      grp.name = `ScreenFabric_${side}`;
      grp.userData.arSide = side;
      grp.userData.arRole = "screenFabric";
      grp.position.set(x, fabricTop, z);
      grp.rotation.y = rotY;
      grp.add(new THREE.Mesh(geo, screenMaterial));        // widok Z ZEWNĄTRZ
      const innerMesh = new THREE.Mesh(geo, screenInnerMaterial); // widok ZE ŚRODKA
      innerMesh.rotation.y = Math.PI;                      // normalna do wnętrza
      innerMesh.position.z = -0.004;                       // 4 mm do środka — bez migotania warstw
      grp.add(innerMesh);
      grp.scale.y = prog;
      grp.visible = vis;
      group.add(grp);
      screens[side].push(grp);
      // dolna listwa aluminiowa (obciążnik) — podąża za dołem płótna (pętla)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.075), material);
      bar.name = `ScreenBottomBar_${side}`;
      bar.userData.arSide = side;
      bar.userData.arRole = "screenBar";
      bar.rotation.y = rotY;
      bar.position.set(x, fabricTop, z);
      bar.visible = vis;
      group.add(bar);
      screenBars[side].push(bar);
      // prowadnice boczne (ZIP) — stałe pionowe szyny na krawędziach płótna
      const guideGeo = new THREE.BoxGeometry(0.05, fabricTop, 0.075);
      const pair = [];
      for (const sgn of [-1, 1]) {
        const g = new THREE.Mesh(guideGeo, material);
        g.name = `ScreenGuide_${side}`;
        g.userData.arSide = side;
        g.rotation.y = rotY;
        if (axisX) g.position.set(x + sgn * (width / 2), fabricTop / 2, z);
        else g.position.set(x, fabricTop / 2, z + sgn * (width / 2));
        g.visible = vis;
        group.add(g);
        pair.push(g);
      }
      screenGuides[side].push(pair);
    };
    // Rolety budowane zawsze (widoczność steruje animacja), z podziałem na
    // segmenty tam, gdzie dodatkowa noga przecina dany bok.
    for (const side of SCREEN_SIDES) {
      const axisX = side === "front" || side === "back";
      const full = (axisX ? totalW : D) - post;
      const segs = segmentsFor(-full / 2, full / 2, legsBySide[side]);
      for (const seg of segs) {
        const x = axisX ? seg.center : (side === "left" ? -totalW / 2 + inset : totalW / 2 - inset);
        const z = axisX ? (side === "front" ? D / 2 - inset : -D / 2 + inset) : seg.center;
        mkScreen(side, seg.width, x, z);
      }
    }
    stateRef.screens = screens;
    stateRef.screenBoxes = screenBoxes;
    stateRef.screenBars = screenBars;
    stateRef.screenGuides = screenGuides;
    stateRef.fabricTop = fabricTop;

    // Przeszklenia (szkło) na wskazanych bokach — dwa skrzydła w aluminiowych
    // ramkach: jedno stałe, drugie przesuwane. Dolna szyna prowadzi skrzydło.
    // Przy „Animacji ruchu" ruchome skrzydło rozsuwa się i zsuwa (pętla).
    const glassPanes = [];
    if (p.glass) {
      const paneH = H - beam;
      // Bezramowe skrzydło — sama tafla szkła, bez aluminiowej ramki.
      const mkSash = (w) => {
        const g = new THREE.Group();
        g.name = "GlassSash";
        g.userData.arRole = "glassSash";
        // Cienka bryła zamiast dwustronnej płaszczyzny: szkło pozostaje
        // widoczne z obu stron także w Quick Look, który nie wspiera
        // dwustronnych materiałów USDZ.
        g.add(new THREE.Mesh(new THREE.BoxGeometry(w, paneH, 0.008), glassMaterial));
        return g;
      };
      // Przeszklenie jednego segmentu ściany (segment = odcinek między nogami
      // lub całą ścianą, gdy nóg brak). segCenter/segWidth — wzdłuż osi ściany.
      const addGlass = (side, segCenter, segWidth) => {
        const along = side === "front" || side === "back" ? "x" : "z";
        const fullW = segWidth;
        const rotY = side === "front" ? 0 : side === "back" ? Math.PI : side === "left" ? -Math.PI / 2 : Math.PI / 2;
        const y = paneH / 2;
        let perpAxis, perpBase, inwardSign;
        if (side === "front") { perpAxis = "z"; perpBase = D / 2 - 0.03; inwardSign = -1; }
        else if (side === "back") { perpAxis = "z"; perpBase = -D / 2 + 0.03; inwardSign = 1; }
        else if (side === "left") { perpAxis = "x"; perpBase = -totalW / 2 + 0.03; inwardSign = 1; }
        else { perpAxis = "x"; perpBase = totalW / 2 - 0.03; inwardSign = -1; }
        // Skrzydła ~75 cm szerokości, ułożone w rzędzie na całym segmencie.
        const n = Math.max(1, Math.round(fullW / 0.75));
        const w = fullW / n;
        const sashW = w + 0.015; // minimalny zakład
        const stackGap = Math.min(0.07, w * 0.14); // odstęp skrzydeł w schowku
        const place = (grp, u, perpOff) => {
          grp.rotation.y = rotY;
          const pos = { x: 0, y, z: 0 };
          pos[along] = u;
          pos[perpAxis] = perpBase + perpOff;
          grp.position.set(pos.x, pos.y, pos.z);
        };
        const rail = new THREE.Mesh(new THREE.BoxGeometry(fullW, 0.05, 0.09), material);
        rail.rotation.y = rotY;
        const rp = { x: 0, y: 0.025, z: 0 };
        rp[along] = segCenter;
        rp[perpAxis] = perpBase + inwardSign * 0.02;
        rail.position.set(rp.x, rp.y, rp.z);
        group.add(rail);
        for (let i = 0; i < n; i++) {
          const closedU = segCenter - fullW / 2 + (i + 0.5) * w;   // rząd, pełne przeszklenie
          const openU = segCenter + fullW / 2 - w / 2 - i * stackGap; // zsunięte i złożone z boku
          const perpOff = inwardSign * (0.02 + i * 0.014); // każde skrzydło na swoim torze
          const sash = mkSash(sashW);
          sash.userData.arAlong = along;
          sash.userData.arClosed = closedU;
          place(sash, closedU, perpOff);
          group.add(sash);
          glassPanes.push({ grp: sash, along, closed: closedU, open: openU });
        }
      };
      for (const side of SCREEN_SIDES) {
        if (!p.glass[side]) continue;
        const axisX = side === "front" || side === "back";
        const full = (axisX ? totalW : D) - post;
        const segs = segmentsFor(-full / 2, full / 2, legsBySide[side]);
        for (const seg of segs) addGlass(side, seg.center, seg.width);
      }
    }
    stateRef.glassPanes = glassPanes;

    // Dodatkowe nogi wskazane przez użytkownika (klik na modelu). Słup od
    // ziemi do belki, w kolorze konstrukcji, z drobną stopką.
    if (p.extraLegs) {
      for (const leg of p.extraLegs) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(post, H, post), material);
        m.position.set(leg.x, H / 2, leg.z);
        group.add(m);
        const footPlate = new THREE.Mesh(new THREE.BoxGeometry(post * 1.6, 0.02, post * 1.6), material);
        footPlate.position.set(leg.x, 0.01, leg.z);
        group.add(footPlate);
      }
    }

    ground.scale.setScalar(Math.max(totalW, D) * 1.9);
    shadow.scale.set(totalW * 1.6, D * 1.7, 1);
    scene.add(group);
    stateRef.slats = slats;

    // Reframe only when the structure's size actually changed, so colour
    // or lighting tweaks never reset the user's view
    // Height excluded: reframing on height made the whole model appear
    // to change size. Distance changes are eased in the render loop and
    // never touch the viewing direction, so nothing jumps.
    // Aim slightly below the model's mid-height so the pergola sits with
    // equal breathing room above the roof and below the posts in the frame.
    controls.target.set(0, H * 0.5, 0);
    const dims = `${p.widths.join(",")}|${D}`;
    if (stateRef.lastDims !== dims) {
      const first = stateRef.lastDims === undefined;
      stateRef.lastDims = dims;
      // Larger minimum distance = the whole model sits smaller in the taller
      // stage, so there's clear empty space around it (not cropped tight).
      const radius = Math.max(totalW * 1.2, D * 1.85, 8.7);
      if (first) {
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, radius);
      } else {
        const dir = camera.position.clone().sub(controls.target);
        if (radius > dir.length()) {
          // Growing: snap the camera out immediately so the widened/deepened
          // structure never pokes past the canvas edge, even for the single
          // frame right after the change.
          camera.position.copy(controls.target).addScaledVector(dir.normalize(), radius);
          stateRef.desiredRadius = undefined;
        } else {
          // Shrinking: ease in smoothly, there's no overflow risk either way.
          stateRef.desiredRadius = radius;
        }
      }
    }
  };

  stateRef.group = group;
  stateRef.material = material;
  stateRef.slatMaterial = slatMaterial;
  stateRef.rebuild = rebuild;
  stateRef.controls = controls;
  rebuild(initialParams);
  material.color.set(initialParams.frameColor);
  slatMaterial.color.set(initialParams.slatColor);
  const applyScreenColor = (hex) => {
    screenMaterial.color.set(hex);
    screenMaterial.emissive.copy(screenMaterial.color).multiplyScalar(SCREEN_GLOW);
    screenInnerMaterial.color.set(hex).multiplyScalar(INNER_SHADE);
    screenInnerMaterial.emissive.copy(screenInnerMaterial.color).multiplyScalar(SCREEN_GLOW);
  };
  if (initialParams.screenColor) applyScreenColor(initialParams.screenColor);
  controls.autoRotate = initialParams.spin;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  io.observe(el);

  const loop = () => {
    if (visible) {
      const p = paramsRef;
      if (p.spin && stateRef.slats) {
        const t = performance.now() / 1000;
        const osc = ((Math.sin(t * 0.35) + 1) / 2) * 100; // 0..100 deg sweep, spokojne tempo
        const rot = THREE.MathUtils.degToRad(osc);
        for (const sl of stateRef.slats) sl.rotation.x = rot;
      }
      // Rolety screen — miękkie opuszczanie/zwijanie każdego boku osobno.
      // Przy „Animacji ruchu" włączone rolety cyklicznie opadają i zwijają się.
      if (stateRef.screens) {
        const want = p.screens || {};
        const fTop = stateRef.fabricTop || 0;
        const now = performance.now() / 1000;
        for (const side of SCREEN_SIDES) {
          let target = want[side] ? 1 : 0;
          if (p.spin && want[side]) {
            const phase = SCREEN_SIDES.indexOf(side) * 1.5;
            // Fala przycięta do [0,1]: roleta DOMYKA się do samej ziemi,
            // chwilę tam zostaje, po czym zwija się w pełni — bez wiecznego
            // paska prześwitu na dole.
            target = Math.min(1, Math.max(0, 0.5 - 0.72 * Math.cos((now + phase) * 0.5)));
          }
          screenAnim[side] += (target - screenAnim[side]) * 0.12;
          if (Math.abs(target - screenAnim[side]) < 0.002) screenAnim[side] = target;
          const anim = screenAnim[side];
          const vis = anim > 0.003;
          const barY = Math.min(fTop, fTop * (1 - anim) + 0.025); // dolna krawędź płótna
          // Każdy bok może mieć kilka segmentów (podział dodatkową nogą) —
          // wszystkie roluje ta sama animacja.
          for (const g of stateRef.screens[side] || []) {
            g.scale.y = Math.max(anim, 0.0001);
            g.visible = vis;
          }
          for (const box of (stateRef.screenBoxes && stateRef.screenBoxes[side]) || []) box.visible = vis;
          for (const bar of (stateRef.screenBars && stateRef.screenBars[side]) || []) {
            bar.visible = vis;
            bar.position.y = barY;
          }
          for (const pair of (stateRef.screenGuides && stateRef.screenGuides[side]) || []) {
            for (const g of pair) g.visible = vis;
          }
        }
      }
      // Przeszklenia — przy „Animacji ruchu" ruchome skrzydło rozsuwa się
      // i zsuwa; w spoczynku pozostaje zamknięte.
      if (stateRef.glassPanes && stateRef.glassPanes.length) {
        const gt = performance.now() / 1000;
        const openAmt = p.spin ? (0.5 - 0.5 * Math.cos(gt * 0.5)) : 0;
        for (const gp of stateRef.glassPanes) {
          gp.grp.position[gp.along] = gp.closed + openAmt * (gp.open - gp.closed);
        }
      }
      // Keep the camera above ground by limiting tilt for the current
      // distance — smooth, no positional snapping
      const r = camera.position.distanceTo(controls.target);
      const cosMax = (0.25 - controls.target.y) / r;
      controls.maxPolarAngle = Math.acos(Math.max(-0.995, Math.min(0.995, cosMax)));
      controls.autoRotate = paramsRef.spin && !spinPaused;
      controls.update();
      if (onFrame) onFrame();
      // Ease the camera distance toward the frame that fits the structure
      const des = stateRef.desiredRadius;
      if (des !== undefined) {
        const dir = camera.position.clone().sub(controls.target);
        const cur = dir.length();
        const next = cur + (des - cur) * 0.07;
        camera.position.copy(controls.target).addScaledVector(dir.normalize(), next);
        if (Math.abs(des - next) < 0.05) stateRef.desiredRadius = undefined;
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function update(params) {
    paramsRef = params;
    stateRef.rebuild?.(params);
    stateRef.material?.color.set(params.frameColor);
    stateRef.slatMaterial?.color.set(params.slatColor);
    if (params.screenColor) applyScreenColor(params.screenColor);
    if (stateRef.controls) stateRef.controls.autoRotate = params.spin;
    if (!params.spin && stateRef.slats) {
      const rot = THREE.MathUtils.degToRad(params.slatAngle);
      for (const sl of stateRef.slats) sl.rotation.x = rot;
    }
  }

  function destroy() {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    controls.dispose();
    pmrem.dispose();
    renderer.dispose();
    el.removeEventListener("pointerdown", armZoom);
    el.removeEventListener("pointerleave", disarmZoom);
    el.removeChild(renderer.domElement);
  }

  /**
   * Zwraca aktualny kadr modelu jako PNG data-URL, złożony na tle w kolorze
   * sceny (do eksportu PDF). Renderuje świeżą klatkę tuż przed odczytem, więc
   * obraz jest zawsze aktualny niezależnie od pauzy w pętli.
   */
  function snapshot() {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, out.height);
    g.addColorStop(0, "#f6f3ee");
    g.addColorStop(1, "#e9e3d9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    return out.toDataURL("image/png");
  }

  /**
   * Buduje niezależny, statyczny model przeznaczony wyłącznie do AR.
   * Nie klonuje kamery, świateł, podłoża, cienia ani elementów technicznych.
   * Geometrie i materiały są kopiowane, więc eksporter może je bezpiecznie
   * przetwarzać i zwalniać bez wpływu na interaktywną scenę konfiguratora.
   */
  function createExportClone() {
    const selectedScreens = paramsRef.screens || {};
    const materialClones = new Map();
    const cloneMaterial = (sourceMaterial) => {
      if (!materialClones.has(sourceMaterial)) materialClones.set(sourceMaterial, sourceMaterial.clone());
      return materialClones.get(sourceMaterial);
    };

    const cloneForExport = (source) => {
      if (source.userData?.arExclude) return null;
      if (source.userData?.arSide && !selectedScreens[source.userData.arSide]) return null;
      if (!source.isGroup && !source.isMesh) return null;

      const target = source.clone(false);
      target.visible = source.userData?.arSide ? true : source.visible;

      if (source.isMesh) {
        target.geometry = source.geometry.clone();
        target.material = Array.isArray(source.material)
          ? source.material.map(cloneMaterial)
          : cloneMaterial(source.material);
      }

      for (const child of source.children) {
        const clonedChild = cloneForExport(child);
        if (clonedChild) target.add(clonedChild);
      }

      if (target.userData.arRole === "slat") {
        target.rotation.x = THREE.MathUtils.degToRad(paramsRef.slatAngle);
      } else if (target.userData.arRole === "screenFabric") {
        target.scale.y = 1;
        target.visible = true;
      } else if (target.userData.arRole === "screenBar") {
        target.position.y = 0.025;
        target.visible = true;
      } else if (target.userData.arRole === "glassSash") {
        target.position[target.userData.arAlong] = target.userData.arClosed;
      }

      return target;
    };

    const root = cloneForExport(group) || new THREE.Group();
    root.name = "PergolaRoot";
    root.visible = true;
    root.updateMatrixWorld(true);

    // 1 jednostka Three.js już oznacza 1 metr. Jedynie ustawiamy punkt
    // odniesienia: środek w X/Z i najniższy punkt dokładnie na podłodze Y=0.
    let bounds = new THREE.Box3().setFromObject(root);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= bounds.min.y;
      root.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(root);
      if (Math.abs(bounds.min.y) > 1e-8) {
        root.position.y -= bounds.min.y;
        root.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(root);
      }
    }

    const size = bounds.getSize(new THREE.Vector3());
    let objectCount = 0;
    root.traverseVisible((object) => { if (object.isMesh) objectCount += 1; });
    root.userData.arMetrics = {
      width: size.x,
      depth: size.z,
      height: size.y,
      minY: bounds.min.y,
      objectCount,
    };
    root.updateMatrixWorld(true);
    return root;
  }

  return { update, destroy, snapshot, createExportClone, setPlacement, getFacingSide, cameraDir, project, setSpinPaused, setOnFrame };
}
