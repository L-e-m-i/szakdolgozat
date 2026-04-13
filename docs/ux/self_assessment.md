# Önértékelés — UI / UX

## Pontozás

| Szempont | Pontszám (1-5) | Indoklás |
|----------|:--------------:|----------|
| Vizuális konzisztencia (szín, tipográfia, spacing) | 4 | A Tailwind CSS default palettáját és spacing rendszerét  használom az egész alkalmazásban. A is tipográfia egységes.|
| Információs hierarchia és olvashatóság | 4 | Világos heading struktúrát használok, a szekciók jól elkülönülnek. A fő CTA-gombok kiemeltek és könnyen megtalálhatók. A profil oldalon a sidebar navigáció egyértelműen választja el a "My Profile" és "Saved Recipes" nézeteket. |
| Visszajelzések (loading, validáció, hiba, siker) | 3 | Minden interaktív felület kezel loading state-et (disabled gomb + változó szöveg), inline valós idejű validációt (pl. jelszó erősség-mérő sáv és checklist), valamint success/error üzeneteket színes háttérrel (zöld/piros). A jelszó regisztrációnál egyenesen valós időben mutatja az egyes követelmények teljesülését (✓/○). |
| Hibakezelés és üres állapotok | 4 | Minden üres állapot tartalmaz CTA gombot, így a felhasználó sosem marad zsákutcában (pl. "No saved recipes" → "Generate Recipe", "No Recipe to Display" → linkek a főoldalra és profilra). Az API hibák kezelve vannak, a 404-es oldalak fallback tartalommal rendelkeznek. A recept generálásnál alert fallback-et használok, ami működőképes, de nem a legesztétikusabb megoldás. |
| Mobil / asztal lefedettség | 3 | A Tailwind responsive breakpointjait (sm/md/lg) használom: mobil-on a layoutok függőlegesen stackelődnek (`flex-col`), desktop-on vízszintesek (`flex-row`). A recept nézet `grid-cols-1 md:grid-cols-3` váltással rendelkezik. Ugyanakkor nincs dedikált mobil optimalizálás: nincs hamburger menü, a touch target-ek mérete nem lett külön tesztelve, és a header nem adaptálódik kis képernyőhöz. |
| Akadálymentesség (a11y) | 3 | Alapvető a11y jellemzők implementálva vannak: aria-label-ek a törlő gombokon és input mezőkön, aria-current az aktív tab-on, aria-labelledby a section-öknél, autoComplete attribútumok a jelszó-kezelőkhöz, focus:ring-2 a fókuszálható elemeken, billentyű-navigáció (Enter, Backspace a tag input-nál). Ugyanakkor nem végeztem kontraszt-tesztelést, nincs screen reader teszt, és az alert() alapú értesítések nem akadálymentesek. |
| Onboarding és új-user élmény | 2 | Nincs dedikált onboarding flow vagy tutorial. A felhasználó közvetlenül a generátor oldalon landol, ami egyszerű és átlátható, de nem vezeti végig az első használaton. A regisztrációnál a jelszó checklist és erősség-mérő segít, de a tag-alapú ingredient input és a modell-választás magyarázat nélkül marad. |
| Teljesítményérzet (gyorsaság, animációk) | 4 | A loading state-ek azonnali vizuális visszajelzést adnak (disabled gomb, "Generating..." / "Saving..." szöveg). A generálás aszinkron hívás, a felhasználó nem blokkolódik. A Tailwind `transition` class-ok finom hover animációkat biztosítanak a gombokon és linkeken. Ugyanakkor nincsenek page transition animációk (fade-in, slide-in), és a recipe betöltés nincs animálva. |

---

## Szöveges értékelés

### Mire vagyok büszke a UI/UX-ben?

A multi-model recept generálás tab-váltása is jól megoldott, a felhasználó egyetlen oldalon összehasonlíthatja különböző AI modellek eredményeit. Az auth flow (JWT + refresh token) biztonságos és a felhasználó számára átlátható. Az empty state-ek mindig tartalmaznak CTA-t, így a felhasználó sosem marad zsákutcában.

### Mit fejlesztenék tovább, ha lenne még két hét?

Először magokon az AI modelleken javítanék: a finetuned modell további tanításával és a promptok finomhangolásával jobb minőségű, változatosabb és pontosabb recepteket generálnék — ez nem fért bele az időmbe tökéletesíteni, így a modellek által produkált receptek minősége jelenleg ingadozó. Másodszor bevezetném a sötét módot. Harmadszor a mobil nézetet optimalizálnám: hamburger menü a headerben, nagyobb touch target-ek, és jobban adaptálódó layout kis képernyőhöz. Végül egy rövid onboarding tour-t implementálnék a generátor oldalon, ami bemutatja a tag-alapú ingredient input használatát és a modell-választás jelentőségét.

### Mit nem sikerült megvalósítani abból, amit terveztem?

Néhány fontos funkció nem került implementálásra: a recept képek feltöltése és megjelenítése, valós idejű keresés és szűrés a mentett receptek között, kategória/címke alapú szűrés és rendezés, valamint offline támogatás (a localStorage fallback csak recept mentésre terjed ki, nem teljes offline működés). Ezek mind olyan funkciók, amelyek jelentősen javítanák a felhasználói élményt, de a projekt időkerete és a backend fejlesztési prioritások miatt háttérbe szorultak.
