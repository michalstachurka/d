<?php
// Lista pól edytowalnych w panelu. Klucze muszą odpowiadać atrybutom
// data-cms / data-cms-img w index.html. Aby dodać nowe pole: dopisz je tu
// i oznacz element w index.html tym samym kluczem.
return [
  "texts" => [
    ["key" => "contact.phone",   "label" => "Telefon",                      "type" => "text"],
    ["key" => "contact.email",   "label" => "E-mail",                       "type" => "text"],
    ["key" => "hero.lead",       "label" => "Nagłówek — akapit pod tytułem", "type" => "textarea"],
    ["key" => "works.lead",      "label" => "Realizacje — wstęp",           "type" => "textarea"],
    ["key" => "tech.lead",       "label" => "Technologia — wstęp",          "type" => "textarea"],
    ["key" => "cta.lead",        "label" => "Sekcja kontaktu — wstęp",      "type" => "textarea"],
    ["key" => "footer.tagline",  "label" => "Stopka — hasło (usługi)",      "type" => "text"],
  ],
  "images" => [
    ["key" => "hero",     "label" => "Zdjęcie główne (hero)",   "default" => "assets/img/hero.jpg"],
    ["key" => "manifest", "label" => "O firmie",                "default" => "assets/img/manifest.jpg"],
    ["key" => "emotion",  "label" => "Zdjęcie szerokie (wieczór)", "default" => "assets/img/emotion.jpg"],
    ["key" => "tech",     "label" => "Technologia",             "default" => "assets/img/tech.jpg"],
    ["key" => "cta",      "label" => "Sekcja kontaktu",         "default" => "assets/img/cta.jpg"],
    ["key" => "real-01",  "label" => "Realizacja 1",            "default" => "assets/img/real-01.jpg"],
    ["key" => "real-02",  "label" => "Realizacja 2",            "default" => "assets/img/real-02.jpg"],
    ["key" => "real-03",  "label" => "Realizacja 3",            "default" => "assets/img/real-03.jpg"],
    ["key" => "real-04",  "label" => "Realizacja 4",            "default" => "assets/img/real-04.jpg"],
    ["key" => "real-05",  "label" => "Realizacja 5",            "default" => "assets/img/real-05.jpg"],
    ["key" => "real-06",  "label" => "Realizacja 6",            "default" => "assets/img/real-06.jpg"],
  ],
];
