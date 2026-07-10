/* ============================================================
   Mini-CMS — warstwa publiczna
   Nadpisuje oznaczone teksty ([data-cms]) i zdjęcia ([data-cms-img])
   wartościami z content.json (zapisywanymi w panelu /admin/).
   Gdy pliku nie ma albo pole jest puste — zostaje domyślna treść z HTML,
   więc strona zawsze działa (także na GitHub Pages, bez PHP).
   ============================================================ */
(() => {
  "use strict";
  fetch("content.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      const texts = (data && data.texts) || {};
      const images = (data && data.images) || {};

      document.querySelectorAll("[data-cms]").forEach((el) => {
        const val = texts[el.getAttribute("data-cms")];
        if (val == null || val === "") return;
        el.textContent = val;
        const href = el.getAttribute("href") || "";
        if (href.startsWith("tel:")) el.setAttribute("href", "tel:" + val.replace(/[^+\d]/g, ""));
        else if (href.startsWith("mailto:")) el.setAttribute("href", "mailto:" + val.trim());
      });

      document.querySelectorAll("[data-cms-img]").forEach((el) => {
        const val = images[el.getAttribute("data-cms-img")];
        if (val) {
          el.setAttribute("src", val);
          el.removeAttribute("onerror"); // nowe zdjęcie ma pierwszeństwo nad placeholderem
        }
      });
    })
    .catch(() => {});
})();
