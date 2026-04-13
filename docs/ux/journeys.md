# Top 3 User Journey

## Journey 1: Recept generálása hozzávalók alapján

**Persona:** Egy kezdő felhasználó, aki a kamrában található hozzávalókból szeretne egy gyors vacsorát főzni.

**Belépési pont:** App ikon vagy közvetlen URL → S03 (Főoldal)

### Lépések

| # | Képernyő | Mit csinál a user | Mit lát / rendszerválasz | Lehetséges hibaág |
|---|----------|-------------------|--------------------------|-------------------|
| 1 | S03 | Beírja az első hozzávalót (pl. "chicken") az input mezőbe, majd Entert nyom vagy az "Add" gombra kattint. | A hozzávaló tag-ként megjelenik a  listában. Az input mező kiürül. | Üres input → nem történik semmi. |
| 2 | S03 | Hozzáad még 2-3 hozzávalót (pl. "rice", "garlic", "onion"). | Minden új hozzávaló tag-ként megjelenik a listában. | — |
| 3 | S03 | Kiválaszt egy vagy több AI modellt a checkboxok közül. | A checkbox állapota megváltozik. Több modell is választható (max 3). | — |
| 4 | S03 | A "Generate Recipe" gombra kattint. | A gomb szövege "Generating..."-ra vált, a gomb disabled lesz. A backend hívás elindul (POST /recipes/generate). | Ha nincs hozzávaló → alert: "Please add at least one ingredient!". Ha nincs modell kiválasztva → alert: "Please select between 1 and 3 models." API hiba → alert a hibaüzenettel. |
| 5 | S04 | A sikeres generálás után automatikusan navigál a recept nézetre. | A generált recept megjelenik: cím, modell attribúció, főzési idő, összetevők listája, számozott lépések. Ha több modell lett kiválasztva, model tab-ok jelennek meg. | Ha nem jön recipe → "No Recipe to Display" + linkek S03-ra és S05-re. |
| 6 | S04 | Átvált egy másik modellre a tab gombokkal (ha több modell van). | Az új modell receptje jelenik meg ugyanazon az oldalon. | — |

**Sikerkritérium:** A felhasználó látja a generált receptet összetevőkkel és számozott lépésekkel, és át tud váltani különböző modellek eredményei között.

**Becsült időtartam:** ~30 másodperc, ~5 kattintás

---

## Journey 2: Felhasználói fiók létrehozása és recept mentése

**Persona:** Egy visszatérő felhasználó, aki regisztrál és el akarja menteni a kedvenc receptjét későbbi felhasználásra.

**Belépési pont:** S03 → Header "Sign Up" gomb → S02

### Lépések

| # | Képernyő | Mit csinál a user | Mit lát / rendszerválasz | Lehetséges hibaág |
|---|----------|-------------------|--------------------------|-------------------|
| 1 | S02 | Beírja a username-et (pl. "kovacs_janos"). | Ha érvénytelen a formátum (nem alfanumerikus/underscore, vagy < 3 karakter), piros hibaüzenet: "Username format is invalid." | Username már foglalt → field-level piros hiba: "Username already exists." |
| 2 | S02 | Opcionálisan megadja a teljes nevét (pl. "Kovács János"). | — | — |
| 3 | S02 | Megadja az email címét (pl. "kovacs@email.com"). | Ha érvénytelen email → piros hiba: "Invalid email address." | Email már regisztrálva → field-level piros hiba: "Email already exists." |
| 4 | S02 | Megadja a jelszavát. A jelszó erősség-mérő sáv és a checklist valós időben frissül. | Színes sáv (piros→sárga→zöld) és strength label (Too Weak → Very Strong). A checklist-en a teljesített követelmények ✓-t, a nem teljesítettek ○-t mutatnak. | Ha nem teljesül valamelyik követelmény → nem提交álható. |
| 5 | S02 | Megismétli a jelszót a confirm mezőben. | Ha nem egyezik → piros hiba: "Passwords do not match." Ha egyezik → nincs hiba. | — |
| 6 | S02 | A "Sign Up" gombra kattint. | A gomb disabled lesz, szövege "Signing up...". A backend hívás elindul (POST /auth/signup). Sikeres regisztráció után automatikus login (POST /auth/token). | API hiba → piros hibaüzenet. |
| 7 | S03 | Auto-login után visszakerül a főoldalra. | A Header-ben megjelenik a üdvözlő szöveg: "Hi, kovacs_janos", "Profile" link és "Log Out" gomb. | — |
| 8 | S03 | Hozzávalók megadása → "Generate Recipe" → S04. | Recept megjelenik. | — |
| 9 | S04 | A "Save Recipe" gombra kattint. | Sikeres mentés esetén alert: "Recipe successfully saved to your account!" Ha nem bejelentkezett → alert + confirm: "Would you like to log in now to upload this recipe?" Ha a mentés helyileg történik → alert: "Recipe saved temporarily in your browser." | API hiba → fallback localStorage. |
| 10 | S04 → S05 → S06 | A Header-ben "Profile" → S05 → "Saved Recipes" tab → S06. | A mentett recept megjelenik egy kártyán a recept nevével és egy rövid előnézettel. | "Error loading saved recipes." ha az API hívás sikertelen. |

**Sikerkritérium:** A felhasználó sikeresen regisztrál, generál egy receptet, és a recept megjelenik a "Saved Recipes" listában.

**Becsült időtartam:** ~60 másodperc, ~8 kattintás

---

## Journey 3: Profil szerkesztése és jelszó módosítása

**Persona:** Egy meglévő felhasználó, aki frissíteni szeretné az email címét és meg szeretné változtatni a jelszavát biztonság okokból.

**Belépési pont:** S05 → Header "Profile" → S05

### Lépések

| # | Képernyő | Mit csinál a user | Mit lát / rendszerválasz | Lehetséges hibaág |
|---|----------|-------------------|--------------------------|-------------------|
| 1 | S05 | A Header-ben "Profile" linkre kattint. Ha nincs bejelentkezve → S01-re redirectel. | A profil oldal betöltődik: sidebar "My Profile" és "Saved Recipes" tab-okkal. A "My Profile" nézetben a felhasználói adatok jelennek meg (username, name, email). | Ha nincs bejelentkezve → useAuth automatikusan S01-re redirectel. |
| 2 | S05 | Az "Edit Profile" gombra kattint. | Az inline szerkesztő form megjelenik: Current Password (sárga háttérrel, kötelező), Full Name, Email, New Password, Confirm Password mezők + Show/Hide togglek. | — |
| 3 | S08 | Megadja a jelenlegi jelszavát a "Current Password" mezőbe. | — | Ha üres → a gomb disabled. Hibás jelszó → API hiba: "Failed to update profile." |
| 4 | S08 | Módosítja az email mezőt (pl. "kovacs@ujemail.com"). | — | Ha érvénytelen email formátum → a backend visszautasítja. |
| 5 | S08 | Új jelszót ad meg és megerősíti. A Show/Hide togglekkel ellenőrzi. | Ha a jelszó < 8 karakter → piros hiba: "Must be at least 8 characters". Ha a két mező nem egyezik → piros hiba: "Passwords do not match". Ha egyeznek → zöld: "Passwords match". | — |
| 6 | S08 | A "Save Changes" gombra kattint. | A gomb szövege "Saving..."-ra vált, disabled lesz. Sikeres mentés → zöld üzenet: "Profile updated successfully." A form visszaáll read-only nézetre. | Ha nincs változás → információs üzenet: "No changes to save." API hiba → piros üzenet a hiba részleteivel. |
| 7 | S05 | A "Cancel" gombra kattint vagy a sikeres mentés után automatikusan visszatér. | Az adatok frissülnek, a szerkesztő form eltűnik. | — |

**Sikerkritérium:** A "Profile updated successfully." üzenet megjelenik, a frissített adatok (email, jelszó) érvényesek a következő bejelentkezéskor.

**Becsült időtartam:** ~45 másodperc, ~6 kattintás
