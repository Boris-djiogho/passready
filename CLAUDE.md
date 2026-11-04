# PASSREADY — Projektkontext für Claude

B2B-SaaS für kleine Modelabels: erzeugt und serviert den **Digitalen Produktpass (DPP)**
nach EU-Ökodesign-Verordnung (ESPR, VO (EU) 2024/1781) für Textilien. Drei Säulen, die kein
Self-Service-Wettbewerber zusammen hat (siehe `../DPP/DPP-Anbieter-Liste.md`):
**Lieferantenportal** (Weberei, Färberei, Konfektion liefern Daten per Token-Link) ·
**Chemie-Check** (REACH-SVHC, PFAS) · **GS1-Digital-Link-Resolver** mit rollenbasiertem
Routing (Verbraucher, Recycler, Behörde sehen je andere Daten). Geschäftsmodell: Abo ab
49 €/Monat plus Pay-per-Scan (nur Verbraucher-Scans zählen, Behörden/Recycler frei).

Recherche und Pitch: `../DPP/` (Landingpage `passready.html`, Wettbewerb, Präsentation).
Normen-Mapping: `docs/normen-mapping.md` (ESPR-Artikel, JTC-24-Normen, GS1 → Code).

## Kommunikation
- Mit dem User auf **Deutsch**; Code, Docstrings, API-Feldnamen und Fehlermeldungen auf
  **Englisch** (EU-weite Lieferanten lesen die API).
- Keine Gedankenstriche („—") und keine Emojis in nutzersichtbaren Texten.

## Stack & Befehle
- Python 3.11 (venv `.venv/`), FastAPI, Pydantic v2 (strikt), pydantic-settings, pytest.
  ```bash
  .venv/bin/pytest                      # Tests
  .venv/bin/ruff check app tests        # Lint
  .venv/bin/mypy                        # Typen (strict, pydantic-Plugin)
  .venv/bin/uvicorn app.main:app --reload --port 8000   # Dev-Server, Swagger unter /docs
  ```
- Dev-Server zum Verifizieren über die preview_*-Tools. Der Launcher liest die Konfiguration
  aus dem Sitzungsordner: wird der Elternordner `Let's rumble` geöffnet, gilt dessen
  `.claude/launch.json` (Name „passready-api", absolute Pfade, weil der Launcher relative
  Binaries dort nicht ausführen darf); wird `passready/` direkt geöffnet, gilt die hiesige
  `.claude/launch.json` (Name „api").
- Datenbank: MVP läuft **in-memory**; Dokumente werden als `model_dump(mode="json")`
  gehalten, exakt das, was später in die JSONB-Spalte geht (`db/schema.sql`,
  `docker-compose.yml` mit PostgreSQL 16 auf Port 5434). Postgres-Repository ist noch
  nicht implementiert.
- Konfiguration über `PASSREADY_*`-Variablen (`.env.example`). Demo-Keys:
  Brand `demo-brand-key`, Behörde `demo-authority-key`.
- **Frontend**: Vite + React 18 + TypeScript (`frontend/`), kein CSS-Framework, Design-
  Tokens handgeschrieben in `src/index.css` (hell/dunkel, mobile-first 375 px).
  ```bash
  export PATH="/usr/local/opt/node@20/bin:$PATH"
  cd frontend && npm run typecheck && npm run build
  npm run dev                      # Vite :5173, proxied /api und /resolver -> :8000
  npm run gen:api                  # TS-Typen aus /openapi.json (Backend muss laufen)
  ```
  `src/api/schema.d.ts` ist generiert und eingecheckt; nach jeder Schema-Änderung im
  Backend `gen:api` laufen lassen, sonst driftet der Vertrag.
- Preview-Launcher: Der App-Launcher für `npm run dev` bleibt in einer App-seitigen
  Bestätigung hängen (`Helpers/disclaimer`). Dann Vite per Bash im Hintergrund starten
  (`npx vite --host 127.0.0.1 --port 5173 --strictPort`) und die Browser-Pane mit
  `preview_start` auf die URL richten. Backend-Launcher „passready-api" funktioniert.

## Architektur-Landkarte
- `app/core/`: `gs1.py` (GTIN-Prüfziffer, AI (10)/(21)-Zeichensatz, Digital-Link-URI),
  `errors.py` (Domänenfehler mit HTTP-Status), `deps.py` (Rolle, API-Keys), `config.py`.
- `app/models/`: Pydantic-Schema. `passport.py` ist das Aggregat; Teilmodelle
  `identifiers`, `actors`, `materials`, `chemistry`, `environment`, `certificates`,
  `circularity`. `views.py` = Rollen-Sichten (Discriminator `role`), `supplier.py` =
  Token und Update-Vertrag, `completeness.py` = Lückenbericht.
- `app/repositories/`: Protocol `DppRepository` + `InMemoryDppRepository`.
  Schlüssel ist `(gtin14, batch|None, serial|None)`; `resolve()` fällt hierarchisch
  Item → Charge → Modell zurück.
- `app/services/`: `resolver.py` (Auflösung, Linkset, Scan-Log), `views.py`
  (Sicht aus Pass bauen), `supplier_update.py` (Token prüfen, Abschnitte mergen,
  ganzes Aggregat re-validieren, Audit-Eintrag mit SHA-256), `passport.py`
  (Brand: anlegen, einladen, veröffentlichen), `completeness.py` (Pflichtfeld-Regeln
  mit Rechtsgrundlage), `chemistry.py` (Screening gegen Demo-Auszug SVHC/PFAS), `seed.py`.
- `app/routers/`: `resolver.py` (`/01/{gtin}[/10/{batch}][/21/{serial}]`,
  `/.well-known/gs1resolver`), `supplier.py` (`POST /api/dpp/{gtin}/supplier-update`,
  ohne Brand-Key, Token im Header `X-Supplier-Token`), `dpp.py` (Brand-API, Header
  `X-API-Key`), `health.py`.
- `frontend/src/`: `api/client.ts` (typisierter Fetch-Client, `ApiError` mit
  `issues`/`missing`), `lib/labels.ts` (deutsche Labels je Enum als `Record`, bricht den
  Build bei neuen Enum-Werten), `pages/PassportPage.tsx` (Routen `/01/...` wie der GS1
  Digital Link, Umschalter Verbraucher/Recycler), `pages/SupplierPage.tsx`
  (`/supplier/:gtin?token=`, zeigt nur erlaubte Abschnitte und die Lücken der eigenen
  Rolle), `pages/BrandPage.tsx` (`/brand`, Key in sessionStorage).
- Das Frontend besitzt die Pfade `/01/...`; Resolver-Aufrufe gehen deshalb über
  `/resolver/01/...` (Vite-Rewrite) bzw. `VITE_RESOLVER_BASE` in Produktion. Backend-CORS
  über `PASSREADY_CORS_ORIGINS`.

## Konventionen / Fallstricke
- **Strikte Typisierung**: alle gespeicherten Modelle erben `DppBaseModel`
  (`extra="forbid"`, `validate_assignment=True`). Read-Modelle erben `DppViewModel`.
- **Keine `computed_field`** in Modellen, die in Responses landen: FastAPI dumpt und
  re-validiert, `extra="forbid"` würde dann brechen. Abgeleitete Werte als Methode
  oder im View-Builder berechnen.
- **Teil-Updates nie direkt zuweisen.** Muster in `supplier_update.apply`: Felder
  berechnen, `model_copy(update=...)`, dann `DigitalProductPassport.model_validate(
  candidate.model_dump())`. So greifen Querverweis-Checks (Zertifikat-IDs, Lieferanten).
- Rollen-Sichten sind **need-to-know**: Verbraucher sehen keine Lieferanten,
  Zertifikatsnummern, EORI; Recycler sehen Material/Stoffe voll, aber nichts
  Kommerzielles; Behörde sieht alles plus Lückenbericht. Neue Felder bewusst zuordnen.
- Nicht veröffentlichte Pässe liefern Verbrauchern/Recyclern 404 (`passport_not_published`),
  Behörden sehen sie.
- Pflichtfelder (`services/completeness.py::RULES`) sind eine **Annahme** auf Basis der
  JRC-Vorstudie; der delegierte Rechtsakt Textil (erwartet Q4 2027) kann sie ändern.
  Jede Regel nennt ihre Quelle, damit Anpassungen punktgenau bleiben.
- Test-Driven: Jede neue Route bekommt einen Test in `tests/`; Fixtures bauen die App
  pro Test frisch mit Seed-Daten (`tests/conftest.py`). Demo-GTINs und Tokens aus
  `app/services/seed.py` importieren, nicht hart kodieren.
- E-Mail-Adressen in Seeds/Tests auf `*.example.org` (email-validator lehnt die
  TLD `.example` ab); https-URLs dürfen `.example` nutzen.
- Frontend: Felder mit Default sind im generierten Typ Pflicht (`verified`, `public`,
  `recycled_percentage`), Felder mit `default_factory` optional (`suppliers`,
  `contributions`); beim Rendern `?? []`. Lange Strings (Digital Link) brauchen
  `overflow-wrap: anywhere`, Grid-Kinder `min-width: 0`, sonst läuft 375 px über.

## Stand
v0.2.0 (2026-11-04): Backend-MVP (A: Pydantic-DPP-Schema Textil, B: Resolver mit
Rollen-Routing, Fallback, Linkset, JSON-LD, Scan-Zählung, C: Supplier-Update mit Tokens,
Abschnittsrechten, Audit-Trail; Brand-API mit Completeness, Chemie-Check, Publish; CORS)
plus Frontend: Pass-Ansicht (Ziel des QR-Codes, Verbraucher/Recycler, Fallback- und
Sperr-Zustände), Lieferantenformular per Token-Link, Brand-Dashboard (Liste, Score,
Einladen mit Link, Chemie-Check, Publish, Protokoll). Kompletter Ablauf Weberei ->
Färberei -> Dashboard -> Publish -> Verbraucher-Pass im Browser verifiziert. Backend
48 Tests, ruff, mypy strict grün; Frontend tsc und vite build grün. Seed: T-Shirt
`04012345678901` (Modell + Charge `LOT2026A`, veröffentlicht), Denim-Jacke
`04012345000016` (wartet auf Weberei/Färberei, Tokens `demo-token-weaving-2026`,
`demo-token-dyeing-2026`). Offen: PostgreSQL-Repository, echte Auth (JWT/OAuth2),
QR-Code-Export, Versionsabruf-API (prEN 18222), EU-Registry-Anbindung (ESPR Art. 12),
ECHA-Kandidatenliste als Import, Pass-Anlage im Dashboard, Frontend-Tests, Deploy.
