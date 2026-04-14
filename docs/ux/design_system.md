# Design Rendszer / Vizuális Nyelv

## UI könyvtár / Komponens-könyvtár

Az alkalmazás **nem használ harmadik féltől származó UI komponens könyvtárat** (nincs MUI, shadcn/ui, Chakra, Bootstrap, stb.). Minden komponens egyedi implementáció, közvetlenül **Tailwind CSS v4** utility class-okkal építve.

A komponensek a `app/frontend/app/components/` mappában találhatók:
- `Header.tsx` — felső navigációs sáv
- `ProfileLayout.tsx` — kétoszlopos profil elrendezés sidebar-ral (ProfileDetails + SavedRecipesList)
- `ErrorBoundary.tsx` — React class-based error boundary

Az oldal-komponensek a `app/frontend/app/routes/` mappában vannak, file-alapú routing-gal (React Router v7).

---

## Színpaletta

A színek a Tailwind CSS v4 default palettából származnak. A v4 belsőleg **OKLCH színteret** használ, ami perceptuálisan egyenletesebb színeket eredményez. Az alábbi táblázat az OKLCH értékeket és a Tailwind v4 hivatalos tokenekből sRGB-re konvertált hex kódokat tartalmazza.


| Szerep | Tailwind class | OKLCH | Közelítő sRGB hex | Használat |
|--------|---------------|-------|-------------------|-----------|
| **Primary** | `blue-600` | `oklch(54.6% 0.245 262.881)` | `#155dfc` | Fő CTA gombok, linkek, aktív tab-ok, focus gyűrűk |
| Primary hover | `blue-700` | `oklch(48.8% 0.243 264.376)` | `#1447e6` | Gombok hover állapota |
| **Success** | `green-500` | `oklch(72.3% 0.219 149.579)` | `#00c950` | "Add" gomb, "Open" gomb, sikeres művelet jelzése |
| Success hover | `green-600` | `oklch(62.7% 0.194 149.214)` | `#00a63e` | Success gombok hover |
| Success background | `green-50` | `oklch(98.2% 0.018 155.826)` | `#f0fdf4` | Sikeres üzenetek háttérszíne |
| Success border | `green-200` | `oklch(92.5% 0.084 155.995)` | `#b9f8cf` | Sikeres üzenetek kerete |
| Success text | `green-600` / `green-700` | `oklch(62.7% 0.194 149.214)` / `oklch(52.7% 0.154 150.069)` | `#00a63e` / `#008236` | Sikeres szöveges visszajelzés |
| **Danger** | `red-500` | `oklch(63.7% 0.237 25.331)` | `#fb2c36` | "Delete" gombok |
| Danger hover | `red-600` | `oklch(57.7% 0.245 27.325)` | `#e7000b` | Delete gombok hover |
| Danger text | `red-600` | `oklch(57.7% 0.245 27.325)` | `#e7000b` | Hibaüzenetek szövege |
| Danger background | `red-50` | `oklch(97.1% 0.013 17.38)` | `#fef2f2` | Hibaüzenetek háttérszíne |
| Danger border | `red-200` | `oklch(88.5% 0.062 18.334)` | `#ffc9c9` | Hibaüzenetek kerete |
| **Warning** | `yellow-50` | `oklch(98.7% 0.026 102.212)` | `#fefce8` | Current password szekció háttérszíne |
| Warning border | `yellow-200` | `oklch(94.5% 0.129 101.54)` | `#fff085` | Current password szekció kerete |
| **Text primary** | `gray-900` | `oklch(21% 0.034 264.665)` | `#101828` | Fő címek (h1) |
| **Text secondary** | `gray-800` | `oklch(27.8% 0.033 256.848)` | `#1e2939` | Alcímek, gombok szövege |
| **Text medium** | `gray-700` | `oklch(37.3% 0.034 259.733)` | `#364153` | Label-ek, section címek |
| **Text muted** | `gray-600` | `oklch(44.6% 0.03 256.802)` | `#4a5565` | Másodlagos szövegek, linkek |
| **Text placeholder** | `gray-500` / `gray-400` | `oklch(55.1% 0.027 264.364)` / `oklch(70.7% 0.022 261.325)` | `#6a7282` / `#99a1af` | Placeholder szövegek, üres állapotok |
| **Surface** | `white` | — | `#FFFFFF` | Kártyák, formok háttérszíne |
| **Surface alt** | `gray-50` | `oklch(98.5% 0.002 247.839)` | `#f9fafb` | Oldal háttérszín (login, signup, index) |
| **Border** | `gray-200` / `gray-300` | `oklch(92.8% 0.006 264.531)` / `oklch(87.2% 0.01 258.338)` | `#e5e7eb` / `#d1d5dc` | Input keretek, elválasztók |
| **Tag background** | `gray-100` | `oklch(96.7% 0.003 264.542)` | `#f3f4f6` | Hozzávaló tag-ek háttérszíne |
| **Disabled** | `gray-400` | `oklch(70.7% 0.022 261.325)` | `#99a1af` | Disabled gombok |

### Jelszó erősség gradient

| Erősség | Szín | OKLCH | Közelítő sRGB hex |
|---------|------|-------|-------------------|
| Too Weak (0-1) | `red-500` | `oklch(63.7% 0.237 25.331)` | `#fb2c36` |
| Fair (2) | `yellow-400` | `oklch(85.2% 0.199 91.936)` | `#fdc700` |
| Good (3) | `green-400` → `green-500` | `oklch(79.2% 0.209 151.711)` → `oklch(72.3% 0.219 149.579)` | `#05df72` → `#00c950` |
| Strong (4) | `green-600` → `green-700` | `oklch(62.7% 0.194 149.214)` → `oklch(52.7% 0.154 150.069)` | `#00a63e` → `#008236` |
| Very Strong (5) | `green-700` → `green-800` | `oklch(52.7% 0.154 150.069)` → `oklch(44.8% 0.119 151.328)` | `#008236` → `#016630` |

---

## Tipográfia

**Betűcsalád:** [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts), `sans-serif` fallback.

A betűtípus a `app/frontend/app/app.css`-ben van importálva:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

### Méret-skála (Tailwind default)

| Class | Méret | Használat |
|-------|-------|-----------|
| `text-xs` | 12px (0.75rem) | Helper szövegek, jelszó checklist, tooltip-ek |
| `text-sm` | 14px (0.875rem) | Label-ek, placeholder szövegek, másodlagos információk |
| `text-base` | 16px (1rem) | Alap szövegméret (body, input) |
| `text-lg` | 18px (1.125rem) | Section label-ek, kártya címek |
| `text-2xl` | 24px (1.5rem) | Section címek (pl. "Ingredients", "Instructions") |
| `text-3xl` | 30px (1.875rem) | Oldal címek (login, signup, profile heading) |
| `text-4xl` | 36px (2.25rem) | Fő címek (recept cím, főoldal heading) |
| `text-5xl` | 48px (3rem) | Extra nagy heading (md breakpoint felett a főoldalon) |

### Font weight-ök

| Class | Súly | Használat |
|-------|------|-----------|
| `font-medium` | 500 | Másodlagos szövegek kiemelése, model label-ek |
| `font-semibold` | 600 | Gombok szövege, section címek, ingredient nevek |
| `font-bold` | 700 | Fő címek, heading-ek, bullet point-ok |

---

## Spacing / Grid

**Alap egység:** Tailwind CSS 4px rendszere (0.25rem = 4px).

### Container szélességek

| Class | Max szélesség | Használat |
|-------|--------------|-----------|
| `max-w-3xl` | 768px | Generátor form (S03) |
| `max-w-4xl` | 896px | Üres recipe nézet |
| `max-w-5xl` | 1024px | Generált recept részletek (S04, S07) |
| `max-w-7xl` | 1280px | Profil oldal (S05, S06) |
| `max-w-md` | 448px | Login / Signup formok |

### Padding

| Használat | Class | Érték |
|-----------|-------|-------|
| Oldal padding | `p-6` | 24px |
| Profil padding (responsive) | `p-4 sm:p-6 md:p-8` | 16px → 24px → 32px |
| Kártya belső padding | `p-4` / `p-6` / `p-8` | 16px / 24px / 32px |
| Input padding | `px-3 py-2` / `px-4 py-3` | 12px×8px / 16px×12px |

### Grid elrendezés

| Használat | Class | Leírás |
|-----------|-------|--------|
| Recept layout | `grid-cols-1 md:grid-cols-3` | Mobil: 1 oszlop, Desktop: összetevők 1 oszlop, utasítások 2 oszlop |
| Mentett receptek grid | `grid-cols-1 sm:grid-cols-2` | Mobil: 1 oszlop, Tablet+: 2 oszlop |
| Gap | `gap-8` / `gap-6` / `gap-4` | 32px / 24px / 16px |

### Profil elrendezés

| Használat | Class | Leírás |
|-----------|-------|--------|
| Sidebar/content | `flex flex-col md:flex-row` | Mobil: függőleges, Desktop: vízszintes |
| Sidebar szélesség | `md:w-1/4` | 25% desktop-on |
| Content szélesség | `md:w-3/4` | 75% desktop-on |

---

## Ikonkészlet

Az alkalmazás **nem használ dedikált ikon könyvtárat** (nincs Lucide, Heroicons, Material Icons).

Helyette szöveges / Unicode karakterek használatosak:

| Ikon | Karakter | Használat |
|------|----------|-----------|
| Törlés | `×` (U+00D7) | Tag eltávolítás gomb |
| Bullet | `•` | Ingredient lista jelölés |
| Pipa | `✓` | Jelszó checklist — teljesítve |
| Kör | `○` | Jelszó checklist — nem teljesítve |

---

## Sötét mód

**Nem támogatott.** Az alkalmazás kizárólag világos (light) módban működik. Nincsenek `dark:` modifier-ek a kódban, és nincs dark mode konfiguráció a Tailwind beállításokban.

---

## Reszponzív breakpoint-ok

Az alkalmazás a **Tailwind CSS v4 default breakpointjait** használja, egyedi breakpoint definíciók nincsenek.

| Breakpoint | Min. szélesség | Használat |
|------------|---------------|-----------|
| `sm` | 640px | Mentett receptek grid váltás (1 → 2 oszlop) |
| `md` | 768px | Recept layout (1 → 3 oszlop), profil sidebar/content split, heading méret növekedés (`text-4xl` → `md:text-5xl`) |
| `lg` | 1024px | Generate gomb szélessége (`w-full` → `lg:w-1/2`) |
| `xl` | 1280px | Nincs explicit használat |

---

## Forrás / Design artifactok

- **Figma / Penpot / Design token fájl:** Nincs. A vizuális stílus közvetlenül a Tailwind utility class-okban van definiálva, külön design token vagy konfigurációs fájl nélkül.
- **Mockupok:** A `docs/ux/mockups/` mappában találhatók tervezési artifactok (PNG exportok).
- **Screenshotok:** A `docs/ux/screenshots/` mappában minden képernyőhöz tartozik screenshot a konvencionális `S<NN>_nev.png` elnevezéssel.
