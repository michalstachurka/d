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

/** Alpha-mapa tkaniny screen: drobna, gęsta siatka (nitki kryjące + oczka
 *  prześwitujące) — dzięki temu roleta jest „przezierna" jak realny screen,
 *  a nie jednolicie przezroczysta ani kryjąca. */
function screenMeshAlpha() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; // nitki — pełne krycie
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#8f8f8f"; // oczka — prześwit (~55%)
  const step = 4;
  for (let y = 0; y < 32; y += step)
    for (let x = 0; x < 32; x += step)
      ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
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
  // Delikatne światło wypełniające — bez niego spód lameli (odwrócony od
  // env. mapy) wychodzi niemal czarny niezależnie od koloru materiału.
  scene.add(new THREE.HemisphereLight("#f4f1ea", "#2a241c", 0.65));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(6.4, 0.95, 7.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4.5;
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
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#f2f6ff" });
  glowMaterial.toneMapped = false;

  // Rolety screen — tkanina techniczna „przezierna": gęsta siatka z drobnymi
  // oczkami (alphaMap), przez którą częściowo widać, ale która daje cień i
  // prywatność. Widoczna z obu stron (DoubleSide).
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c9b79c"),
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0.95,
    alphaMap: screenMeshAlpha(),
    side: THREE.DoubleSide,
  });
  // Przeszklenia — tafla szkła: mocno przezroczysta, gładka, lekko chłodna.
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#cddfe6"),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
  });
  glassMaterial.envMapIntensity = 1.3;
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

      // Posts
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          box(post, H, post, (sx * (W - post)) / 2, H / 2, (sz * (D - post)) / 2);
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

    // LEDs actually cast light: a soft pool on the ground under each module
    if (p.ledLinear || p.ledSpots) {
      const strength = (p.ledLinear ? 120 : 0) + (p.ledSpots ? 100 : 0);
      for (const cx of centers) {
        const sp = new THREE.SpotLight("#f2f6ff", strength, H * 5, 1.15, 0.7, 1.3);
        sp.position.set(cx, H - beam, 0);
        sp.target.position.set(cx, 0, 0);
        group.add(sp);
        group.add(sp.target);
      }
    }

    // Rolety screen na obwodzie — kaseta (skrzynka) pod belką + płótno, które
    // zwisa od jej spodu. Geometria płótna przesunięta tak, że górna krawędź
    // jest w punkcie zaczepienia, więc skalowanie w osi Y „opuszcza" roletę.
    const screens = {};
    const screenBoxes = {};
    const screenBars = {};
    const screenGuides = {};
    const cassetteH = 0.105; // skrzynka rolety — 10,5 cm
    const fabricTop = H - beam - cassetteH; // płótno startuje od spodu skrzynki
    const inset = 0.02;
    // Obrót płótna tak, by FrontSide (normalna) patrzyła NA ZEWNĄTRZ pergoli.
    const OUT_ROT = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
    const mkScreen = (side, width, x, z) => {
      const rotY = OUT_ROT[side];
      const axisX = side === "front" || side === "back"; // szerokość biegnie po X
      // skrzynka w kolorze konstrukcji, tuż pod belką
      const box = new THREE.Mesh(new THREE.BoxGeometry(width, cassetteH, 0.11), material);
      box.position.set(x, H - beam - cassetteH / 2, z);
      box.rotation.y = rotY;
      group.add(box);
      screenBoxes[side] = box;
      // płótno — od spodu skrzynki do ziemi
      const geo = new THREE.PlaneGeometry(width, fabricTop, 1, 1);
      geo.translate(0, -fabricTop / 2, 0); // górna krawędź w local y = 0
      const m = new THREE.Mesh(geo, screenMaterial);
      m.position.set(x, fabricTop, z);
      m.rotation.y = rotY;
      const prog = Math.max(screenAnim[side], 0.0001);
      m.scale.y = prog;
      const vis = prog > 0.003;
      m.visible = vis;
      box.visible = vis;
      group.add(m);
      screens[side] = m;
      // dolna listwa aluminiowa (obciążnik) — podąża za dołem płótna (pętla)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.075), material);
      bar.rotation.y = rotY;
      bar.position.set(x, fabricTop, z);
      bar.visible = vis;
      group.add(bar);
      screenBars[side] = bar;
      // prowadnice boczne (ZIP) — stałe pionowe szyny na krawędziach płótna
      const guideGeo = new THREE.BoxGeometry(0.05, fabricTop, 0.075);
      const pair = [];
      for (const sgn of [-1, 1]) {
        const g = new THREE.Mesh(guideGeo, material);
        g.rotation.y = rotY;
        if (axisX) g.position.set(x + sgn * (width / 2), fabricTop / 2, z);
        else g.position.set(x, fabricTop / 2, z + sgn * (width / 2));
        g.visible = vis;
        group.add(g);
        pair.push(g);
      }
      screenGuides[side] = pair;
    };
    mkScreen("front", totalW - post, 0, D / 2 - inset);
    mkScreen("back", totalW - post, 0, -D / 2 + inset);
    mkScreen("left", D - post, -totalW / 2 + inset, 0);
    mkScreen("right", D - post, totalW / 2 - inset, 0);
    stateRef.screens = screens;
    stateRef.screenBoxes = screenBoxes;
    stateRef.screenBars = screenBars;
    stateRef.screenGuides = screenGuides;
    stateRef.fabricTop = fabricTop;

    // Przeszklenia (szkło) na wskazanych bokach — tafla + dolna szyna +
    // pionowy słupek, żeby czytało się jako szklana zabudowa/szyby.
    if (p.glass) {
      const paneH = H - beam;
      const gI = 0.005;
      const mkGlass = (width, x, z, rotY) => {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, paneH), glassMaterial);
        pane.position.set(x, paneH / 2, z);
        pane.rotation.y = rotY;
        group.add(pane);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.06), material);
        rail.position.set(x, 0.025, z);
        rail.rotation.y = rotY;
        group.add(rail);
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.04, paneH, 0.05), material);
        mull.position.set(x, paneH / 2, z);
        mull.rotation.y = rotY;
        group.add(mull);
      };
      if (p.glass.front) mkGlass(totalW - post, 0, D / 2 - gI, 0);
      if (p.glass.back) mkGlass(totalW - post, 0, -D / 2 + gI, 0);
      if (p.glass.left) mkGlass(D - post, -totalW / 2 + gI, 0, Math.PI / 2);
      if (p.glass.right) mkGlass(D - post, totalW / 2 - gI, 0, Math.PI / 2);
    }

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
  if (initialParams.screenColor) screenMaterial.color.set(initialParams.screenColor);
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
      if (stateRef.screens) {
        const want = p.screens || {};
        const fTop = stateRef.fabricTop || 0;
        for (const side of SCREEN_SIDES) {
          const target = want[side] ? 1 : 0;
          screenAnim[side] += (target - screenAnim[side]) * 0.12;
          if (Math.abs(target - screenAnim[side]) < 0.002) screenAnim[side] = target;
          const anim = screenAnim[side];
          const vis = anim > 0.003;
          const m = stateRef.screens[side];
          if (m) { m.scale.y = Math.max(anim, 0.0001); m.visible = vis; }
          const box = stateRef.screenBoxes && stateRef.screenBoxes[side];
          if (box) box.visible = vis;
          const bar = stateRef.screenBars && stateRef.screenBars[side];
          if (bar) {
            bar.visible = vis;
            bar.position.y = Math.min(fTop, fTop * (1 - anim) + 0.025); // dolna krawędź płótna
          }
          const guides = stateRef.screenGuides && stateRef.screenGuides[side];
          if (guides) for (const g of guides) g.visible = vis;
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
    if (params.screenColor) screenMaterial.color.set(params.screenColor);
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

  return { update, destroy, snapshot, setPlacement, getFacingSide, project, setSpinPaused, setOnFrame };
}
