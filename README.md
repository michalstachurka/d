# Świat Pergoli — strona www

Autorska strona typu premium dla marki Świat Pergoli: pergole bioklimatyczne i solarne,
ogrody zimowe, werandy, szyby przesuwne, screeny osłonowe, zabudowy boczne,
oświetlenie LED, automatyka i czujniki pogodowe.

Statyczny stack — **HTML + CSS + vanilla JS**, zero zależności i bez build stepu.
Wystarczy dowolny hosting plików statycznych.

## Uruchomienie

```bash
# dowolny serwer statyczny, np.:
python3 -m http.server 8000
# → http://localhost:8000
```

Otwieranie `index.html` bezpośrednio z dysku (file://) też działa, ale fonty
i lazy-loading zachowują się lepiej przez serwer.

## Podmiana zdjęć (najważniejsze!)

Strona odwołuje się do zdjęć w `assets/img/*.jpg`. Gdy pliku nie ma (albo się nie
wczyta), każdy obraz automatycznie podstawia elegancki placeholder SVG
z `assets/img/placeholders/` (mechanizm `onerror` w `<img>`). Każdy placeholder ma
w rogu podpis, jaki plik należy wgrać — **żadna edycja kodu nie jest potrzebna**,
wystarczy zapisać zdjęcie pod wskazaną nazwą w `assets/img/`.

10 slotów ma już przypisane unikalne, prawdziwe zdjęcia marki. 9 slotów celowo
zostało na placeholderze — te same kadry pojawiały się w materiałach źródłowych
po 2–3 razy (identyczne pliki), a pokazanie tego samego zdjęcia w kilku sekcjach
jednej strony (np. Hero i Realizacje) wygląda tanio i podważa wiarygodność
portfolio. Lepiej pokazać przemyślany placeholder niż powtórkę.

| Plik | Sekcja | Sugerowany kadr | Proporcje | Status |
|---|---|---|---|---|
| `assets/img/hero.jpg` | Hero (pełny ekran) | pergola / ogród zimowy o zmierzchu, szeroki kadr | 3:2 | ✅ gotowe |
| `assets/img/manifest.jpg` | Manifest / O firmie | detal światła między lamelami, pion | 4:5 | brakuje |
| `assets/img/offer-bioclimatic.jpg` | Oferta 01 | pergola bioklimatyczna, otwarte lamele | 4:3 | ✅ gotowe |
| `assets/img/offer-solar.jpg` | Oferta 02 | lamele solarne / PV w słońcu | 4:3 | ✅ gotowe |
| `assets/img/offer-garden-room.jpg` | Oferta 03 | ogród zimowy / weranda | 4:3 | brakuje |
| `assets/img/offer-screen.jpg` | Oferta 04 | screen ZIP opuszczony | 4:3 | ✅ gotowe |
| `assets/img/offer-sliding-glass.jpg` | Oferta 05 | hartowane szyby przesuwne | 4:3 | ✅ gotowe |
| `assets/img/offer-side.jpg` | Oferta 06 | zabudowy boczne / lamele pionowe | 4:3 | ✅ gotowe |
| `assets/img/offer-led.jpg` | Oferta 07 | pergola nocą z LED | 4:3 | ✅ gotowe |
| `assets/img/offer-automation.jpg` | Oferta 08 | pilot / aplikacja / czujnik | 4:3 | ✅ gotowe |
| `assets/img/real-01.jpg` | Realizacje | taras prywatny, pion | 4:5 | brakuje |
| `assets/img/real-02.jpg` | Realizacje | ogród / strefa wypoczynku | 4:3–16:10 | brakuje |
| `assets/img/real-03.jpg` | Realizacje | restauracja | 3:2 | brakuje |
| `assets/img/real-04.jpg` | Realizacje | hotel / spa nocą, pion | 4:5 | brakuje |
| `assets/img/real-05.jpg` | Realizacje | apartament / taras na dachu | 4:3 | ✅ gotowe |
| `assets/img/real-06.jpg` | Realizacje | patio biurowe / komercyjne | 16:10 | ✅ gotowe |
| `assets/img/emotion.jpg` | Sekcja emocjonalna | wieczór pod pergolą, ciepłe światło, szeroki | 16:9 | brakuje |
| `assets/img/tech.jpg` | Technologia | detal konstrukcji / LED (zbliżenie) | 4:3 | brakuje |
| `assets/img/cta.jpg` | Finalne CTA | zachód słońca nad tarasem, szeroki | 16:10 | brakuje |

Wskazówki:
- każdy plik powinien być **inny** — jedno zdjęcie w dwóch sekcjach tej samej
  strony rzuca się w oczy przy przewijaniu; jeśli brakuje unikalnego kadru dla
  danego slotu, zostaw placeholder zamiast dublować istniejące zdjęcie,
- kadry mogą się różnić od sugerowanych — `object-fit: cover` przytnie je poprawnie,
- kompresuj do JPG ~80% (docelowo można dodać WebP/AVIF przez `<picture>`),
- hero, cta i emotion (pełnoekranowe) potrzebują szerokości min. 2400 px,
- gdy wszystkie `.jpg` będą wgrane, katalog `assets/img/placeholders/` można usunąć
  wraz z atrybutami `onerror` w `index.html` (opcjonalnie — nie przeszkadzają).

## Dane do uzupełnienia

W kodzie są **placeholdery do podmiany** (wyszukaj w `index.html` i `js/main.js`):

- `kontakt@swiatpergoli.com` → zweryfikuj adres e-mail (HTML + `js/main.js` w obsłudze formularza),
- link `facebook.com` → adres profilu firmy.

Numer telefonu, Instagram oraz obszar działania (Śląsk i Małopolska) zostały
zweryfikowane na stronie i profilu marki.

## Formularz

Formularz działa bez backendu — składa wiadomość i otwiera program pocztowy
(`mailto:`). Do wysyłki bez klienta poczty podłącz np. Formspree/Basin albo własny
endpoint: w `js/main.js`, sekcja „Formularz", zamień `mailto` na `fetch(...)`.

## Struktura

```
index.html          — cała treść strony (PL)
css/style.css       — design system (tokens na górze pliku), layout, animacje
js/main.js          — preloader, smooth scroll, reveal, oferta pozioma,
                      konfigurator, menu mobilne, parallax, formularz
assets/fonts/       — Marcellus, Hanken Grotesk (variable), IBM Plex Mono (woff2, lokalnie)
assets/img/         — tu wgraj zdjęcia .jpg (patrz tabela wyżej)
assets/img/placeholders/ — awaryjne placeholdery SVG
```

## Decyzje projektowe (skrót)

- **Typografia**: Marcellus (nagłówki — inskrypcyjny, architektoniczny charakter),
  Hanken Grotesk (tekst), IBM Plex Mono (adnotacje „techniczne" jak z rysunku
  architektonicznego). Fonty serwowane lokalnie.
- **Paleta**: ciepły grafit `#161513`, kość słoniowa `#F1EBE0`, piasek `#E3D8C4`,
  ciepły szary `#8C8578`, akcent miedziany `#B97F52` — wyłącznie jako akcent.
- **Motyw przewodni**: lamela i światło między lamelami — preloader (kurtyna
  z 5 lameli), przełącznik menu, progres oferty, favicon.
- **Oferta**: poziomy sticky-scroll na desktopie (8 scen), na mobile pozioma
  karuzela ze scroll-snap.
- **Personalizacja**: interaktywny schemat SVG pergoli budowany warstwami
  (konstrukcja → lamele → zabudowy → LED → automatyka → czujniki) + próbki koloru.
- **Dostępność**: skip-link, focus-visible, aria, pełne wsparcie
  `prefers-reduced-motion` (preloader i animacje wyłączone).
