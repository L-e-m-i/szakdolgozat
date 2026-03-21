# Project Plan – Recept generáló webalkalmazás


## Egy mondatos értékajánlat

Az alkalmazás a felhasználóktól kapott hozzávalók alapján automatikusan recepteket generál két gépi tanulási modell segítségével, majd biztonságos bejelentkezés mellett személyes receptgyűjteménybe mentést és visszakeresést biztosít.


## Képességek


| Képesség | Kategória | Komplexitás | Miért nem triviális? |

|---|---|---|---|

| Recept generálás (AI modellekből) | Érték | L | Duál modell ensemble (finomhangolt T5 + custom TransformerV3), fallback kezelés, timeout kezelés |

| Felhasználó bejelentkezés (JWT + refresh token + HttpOnly cookie) | Produktivitás | L | Refresh token rotáció, hashelt DB-tárolás, HttpOnly/Secure cookie stratégia, jelszóhasítás (Argon2), CORS és dev/prod eltérések kezelése |

| Receptek mentése/lekérése (felhasználói profil) | Érték | M | SQLAlchemy ORM relációk, kaszkádos törlés, tulajdonos-alapú hozzáférés-ellenőrzés (csak saját receptek) |

| Hibakezelés, validáció & védelem | Produktivitás | M | Strukturált hibaválaszok, Pydantic validáció (mezőkorlátok), auth endpoint rate limiting, részletes naplózás |

| ML modell betöltés & caching | Érték | M | Eszközdetektálás (CUDA/CPU), lusta betöltés singleton minta, modell verziózás |

| Frontend hibavédelem & ismételt próbálkozás logika | Produktivitás | S | Kapcsolat ismételt próbálkozása, token frissítés kezelése, felhasználóbarát hibaüzenetek |


**Kategória:** `Érték` (felhasználó érzékeli) vagy `Produktivitás` (minőséget garantál: auth, hibakezelés, tesztek, deploy)

**Komplexitás:** `S` < 1 nap · `M` 2–5 nap · `L` 1+ hét


Minimum: 6 képesség, ebből 3 Produktivitás, 2 L-es.


## A legnehezebb rész

Az ML modellek betöltése és memória-hatékony futtatása GPU/CPU eszközön. A finetuned T5 és custom TransformerV3 modellek nagy memóriaigényűek, ezért hardverkorlátok, timeout-ok és fallback stratégiák kezelése kritikus.

Ezzel párhuzamosan a publikus internetes üzemeltetéshez szükséges auth-biztonság sem triviális: refresh token rotáció, DB-ben hashelt token tárolás, HttpOnly cookie szállítás, valamint végpontszintű rate limiting összehangolása.


## Tech stack – indoklással

| Réteg | Technológia | Miért ezt és nem mást? |

|---|---|---|

| UI | React 18 + TypeScript + Vite | Modern, gyors HMR, erős típusozás, React Router v7 fájl-alapú útválasztás, Tailwind CSS hasznos-első stílusozáshoz |

| Backend / logika | FastAPI + Python 3.13 | Aszinkron-első keretrendszer, automatikus OpenAPI séma generálás, Pydantic validáció, magas teljesítmény |

| Adattárolás | PostgreSQL + SQLAlchemy ORM | Megbízható relációs adatbázis, erős funkciók (megkötések, indexelés, ACID), SQLAlchemy biztonságos lekérdezésekhez |

| Auth | JWT + refresh token + Argon2 + HttpOnly cookie | Állapotmentes auth, hashelt refresh token tárolás, biztonságos rotáció, erős jelszóhasítás, dev/prod cookie stratégia |

| ML / AI | PyTorch + Hugging Face Transformers (finomhangolt T5 + custom TransformerV3) | Ipari szabvány, előtanított súlyok, egyszerű integráció, eszközdetektálás (CUDA/CPU) |

| Telepítés | Docker & Docker Compose | Konzisztens fejl./prod. környezet, könnyű helyi tesztelés, containerizált mikroszolgáltatások |

| Tesztelés | PyTest (backend) + Vitest (frontend) | Átfogó tesztlefedettség, integrációs tesztek DB fixture-okkal, CI-kész |


## Ami kimarad (nem célok)

- Mobilalkalmazás (csak web, reszponzív design Tailwind CSS-sel)

- Fizetési/előfizetési rendszer (minden funkció ingyenes)

- Többnyelvű receptgenerálás (angol receptek egyelőre)

- Valós idejű együttműködő receptszerkesztés (csak személyes mentett receptek)

- Közösségi funkciók (követés, hozzászólások, szavazatok) — az alapvető generálás + mentés a fókusz


## Ami még nem tiszta

- Cookie finomhangolás éles környezetre: `SameSite`, `Secure`, domain/subdomain stratégia és reverse proxy együttműködés.

- Naplózás és audit: auth események és érzékeny műveletek központosított, elemezhető naplózása.

- Frontend auth állapotkezelés egyszerűsítése: a maradék, régi localStorage-alapú ellenőrzések teljes kivezetése.
