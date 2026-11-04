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
- Dev-Server zum Verifizieren über die preview_*-Tools (Name „api", `.claude/launch.json`).
- Datenbank: MVP läuft **in-memory**; Dokumente werden als `model_dump(mode="json")`
  gehalten, exakt das, was später in die JSONB-Spalte geht (`db/schema.sql`,
  `docker-compose.yml` mit PostgreSQL 16 auf Port 5434). Postgres-Repository ist noch
  nicht implementiert.
- Konfiguration über `PASSREADY_*`-Variablen (`.env.example`). Demo-Keys:
  Brand `demo-brand-key`, Behörde `demo-authority-key`.

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

## Stand
v0.1.0 (2026-11-04): MVP-Backend. Komponente A (Pydantic-DPP-Schema Textil),
B (Resolver mit Rollen-Routing, Fallback, Linkset, JSON-LD, Scan-Zählung),
C (Supplier-Update mit Tokens, Abschnittsrechten, Audit-Trail) plus Brand-API
(anlegen, Lieferant einladen, Completeness, Chemie-Check, Publish). Seed: T-Shirt
`04012345678901` (Modell + Charge `LOT2026A`, veröffentlicht), Denim-Jacke
`04012345000016` (wartet auf Weberei/Färberei, Tokens `demo-token-weaving-2026`,
`demo-token-dyeing-2026`). Offen: PostgreSQL-Repository, echte Auth (JWT/OAuth2),
QR-Code-Export, Versionsabruf-API (prEN 18222), EU-Registry-Anbindung (ESPR Art. 12),
ECHA-Kandidatenliste als Import statt Demo-Auszug, Frontend (Brand-Dashboard,
Lieferantenformular, Pass-Landingpage).
