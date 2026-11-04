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
  System handgeschrieben in `src/index.css` (hell/dunkel, mobile-first 375 px).
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
  `/.well-known/gs1resolver`), `qr.py` (`GET /api/qr/01/{gtin}[/10/{batch}]`, öffentlich,
  SVG/PNG, Header `X-Digital-Link`), `supplier.py` (`POST /api/dpp/{gtin}/supplier-update`,
  ohne Brand-Key, Token im Header `X-Supplier-Token`), `dpp.py` (Brand-API, Header
  `X-API-Key`, inkl. `POST /api/dpp/{gtin}/images`), `health.py`.
- QR-Code (`services/qr.py`, segno): kodiert ausschließlich den GS1 Digital Link mit
  `resolver_base_url`, Fehlerkorrektur M, Ruhezone 4 Module. Die Domain im Code muss die
  Produktiv-Resolver-Domain sein; für einen Handy-Test im LAN `PASSREADY_RESOLVER_BASE_URL`
  auf `http://<LAN-IP>:8000` und `PASSREADY_LANDING_PAGE_BASE_URL` auf
  `http://<LAN-IP>:5173` setzen und Vite mit `--host 0.0.0.0` starten.
- Produktbilder (`services/media.py`): Magic-Bytes-Prüfung (JPEG/PNG/WebP), 5 MB, höchstens
  8 Bilder, Ablage unter `PASSREADY_MEDIA_DIR` (gitignored), Auslieferung unter
  `/media/uploads`, öffentliche URL aus `PASSREADY_MEDIA_BASE_URL`. Demo-Illustrationen
  liegen in `app/static/demo/` und werden unter `/media/demo` serviert.
  Reihenfolge und Löschen über `PUT /api/dpp/{gtin}/images` (erstes Bild = Hauptbild im
  Pass, weggelassene Uploads werden von der Platte entfernt).
- Lieferanten-Erinnerungen (`services/reminders.py`): `POST /api/dpp/{gtin}/suppliers/{id}/remind`
  komponiert eine deutsche Mail mit Lückenliste und Portal-Link (`PASSREADY_PORTAL_BASE_URL`),
  übergibt sie an einen `Notifier`. Im MVP ist das der `OutboxNotifier` (nur gespeichert,
  `GET /api/dpp/{gtin}/outbox`), produktiv SMTP/Provider dahinter stecken.
  `GET /api/dpp/{gtin}/suppliers` liefert Wartezeit, offenen Link und `reminder_due`
  (nach `PASSREADY_REMINDER_INTERVAL_DAYS`, Standard 7). Automatischer Versand per Cron ist
  offen; die Fälligkeit ist bereits berechnet.
- Pass anlegen im Dashboard: `components/NewPassportForm.tsx` übernimmt den Betreiber aus
  dem ersten vorhandenen Pass (`<details>` zum Ändern); CSV-Import ist offen.
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
- `HttpsUrl` erlaubt `http://` nur für `localhost`/`127.0.0.1` (Medien im Dev-Backend);
  alles andere bleibt https-only.
- Frontend: Felder mit Default sind im generierten Typ Pflicht (`verified`, `public`,
  `recycled_percentage`), Felder mit `default_factory` optional (`suppliers`,
  `contributions`); beim Rendern `?? []`. Lange Strings (Digital Link) brauchen
  `overflow-wrap: anywhere`, Grid-Kinder `min-width: 0`, sonst läuft 375 px über.
- **Design-Richtung (Referenz arianee.com, keine KI-Template-Optik)**: editorial statt
  Kartenstapel. Eyebrow in Versalien, Display-Titel in Serif (`.display`), nummerierte
  Abschnitte (`.section` + `.section-title` mit `.num`), Haarlinien statt Rahmen, eine
  Akzentfarbe, Pfeile als Link-Signal (`.link-list`, `.btn-arrow`), Pillen-Buttons mit
  44 px Höhe. Keine bunten Chips: Status immer als Text mit Glyph (`.status-ok|warn|
  danger|neutral`), nie nur über Farbe. Keine Schatten, keine Emojis, keine Icon-Libs.
- **WCAG 2.2 AA ist Pflicht und wird geprüft**: Skip-Link, `<main id="main" tabIndex=-1>`
  pro Seite (Fokus nach Routenwechsel über `useFocusMainOnNavigate`), `usePageTitle`,
  `:focus-visible`-Ring 3 px, Tabs mit `role=tab`/`aria-selected`/Pfeiltasten, Formulare
  mit `fieldset`/`legend`, jedes Feld mit `<label htmlFor>`, Hinweise per
  `aria-describedby`, 422-Fehler als `role=alert`-Zusammenfassung mit Links zu den
  Feldern plus `aria-invalid`, Lade- und Erfolgszustände als `role=status`, Tabellen mit
  `caption` und `scope`, Listen-Auswahl als `<button aria-current>`. Alle Text-Token gegen
  ihre Flächen mindestens 4,5:1, Rahmen von Eingabefeldern mindestens 3:1 (Kontrast-
  Rechnung siehe Session-Skript, bei neuen Farben wiederholen). Prüfung mit axe-core:
  Vite serviert `/node_modules/axe-core/axe.min.js`; im Browser-Pane per `javascript_tool`
  laden und `axe.run(document, {runOnly: {type: "tag", values: ["wcag2a", "wcag2aa",
  "wcag21aa", "wcag22aa", "best-practice"]}})` auf jeder Seite ausführen; Stand 2026-11-04
  null Verstöße auf Pass, Lieferantenformular und Dashboard.
- Ländercodes nie roh anzeigen: `countryName()` (Intl.DisplayNames, de) in `lib/a11y.ts`.

## Stand
v0.5.0 (2026-11-05): Backend-MVP (A: Pydantic-DPP-Schema Textil, B: Resolver mit
Rollen-Routing, Fallback, Linkset, JSON-LD, Scan-Zählung, C: Supplier-Update mit Tokens,
Abschnittsrechten, Audit-Trail; Brand-API mit Completeness, Chemie-Check, Publish; CORS)
plus Frontend im editorialen Design (Referenz Arianee): Pass-Ansicht (Ziel des QR-Codes,
Tabs Kundinnen/Recycler, Kompositionsbalken, Fallback- und Sperr-Zustände),
Lieferantenformular per Token-Link (Fieldsets, Fehlerzusammenfassung), Label-Dashboard
(Artikel anlegen, Produktbilder mit Upload, Hauptbild und Löschen, Vollständigkeit mit
Progressbar, Lieferanten mit Wartezeit, Erinnerung fällig und Erinnern (Postausgang), Einladen
mit Link, QR-Code für das Etikett mit SVG/PNG-Download, Chemie-Check automatisch, Publish,
Protokoll). Pass-Ansicht zeigt alle Bilder als Galerie. WCAG 2.2 AA: axe-core null Verstöße auf allen Seiten, Kontraste gerechnet,
Tastaturbedienung geprüft. Kompletter Ablauf Weberei -> Färberei -> Dashboard -> Publish
-> Verbraucher-Pass im Browser verifiziert. Backend 59 Tests, ruff, mypy strict grün;
Frontend tsc und vite build grün. Seed: T-Shirt `04012345678901` (Modell + Charge
`LOT2026A`, veröffentlicht), Denim-Jacke `04012345000016` (wartet auf Weberei/Färberei,
Tokens `demo-token-weaving-2026`, `demo-token-dyeing-2026`). Offen: PostgreSQL-
Repository, echte Auth (JWT/OAuth2), Versionsabruf-API (prEN 18222),
EU-Registry-Anbindung (ESPR Art. 12), ECHA-Kandidatenliste als Import, echter Mailversand
(SMTP) plus Cron für fällige Erinnerungen, CSV-Import, Frontend-Tests (axe in CI), Deployment.
