import { GLTFExporter } from "../assets/vendor/three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "../assets/vendor/three/examples/jsm/exporters/USDZExporter.js";

const gltfExporter = new GLTFExporter();
const usdzExporter = new USDZExporter();

const disposeClone = (root) => {
  const disposedMaterials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material && !disposedMaterials.has(material)) {
        disposedMaterials.add(material);
        material.dispose();
      }
    });
  });
};

/**
 * Zarządza jedną parą dynamicznych plików AR. Każde kolejne przygotowanie
 * oraz zamknięcie modalu unieważnia poprzednie Blob URL-e.
 */
export class ARAssetManager {
  constructor() {
    this.urls = [];
    this.version = 0;
  }

  clear() {
    this.version += 1;
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls = [];
  }

  async generate(root, { includeUSDZ = false } = {}) {
    this.clear();
    const version = this.version;
    const generatedUrls = [];
    const metrics = { ...root.userData.arMetrics };

    try {
      const data = await gltfExporter.parseAsync(root, {
        binary: true,
        onlyVisible: true,
        trs: false,
        maxTextureSize: 1024,
      });
      if (!(data instanceof ArrayBuffer)) throw new Error("Eksporter GLB nie zwrócił danych binarnych.");

      const glb = new Blob([data], { type: "model/gltf-binary" });
      const glbUrl = URL.createObjectURL(glb);
      generatedUrls.push(glbUrl);

      let usdz = null;
      let usdzUrl = null;
      if (includeUSDZ) {
        const usdzData = await usdzExporter.parse(root, { quickLookCompatible: true, maxTextureSize: 1024 });
        usdz = new Blob([usdzData], { type: "model/vnd.usdz+zip" });
        usdzUrl = URL.createObjectURL(usdz);
        generatedUrls.push(usdzUrl);
      }

      if (version !== this.version) throw new DOMException("Generowanie AR zostało anulowane.", "AbortError");
      this.urls = generatedUrls;
      return { glb, glbUrl, usdz, usdzUrl, metrics };
    } catch (error) {
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
      if (version === this.version) this.urls = [];
      throw error;
    } finally {
      disposeClone(root);
    }
  }
}
