# PassReady: Digitaler Produktpass für kleine Modelabels (MVP-Backend)

PassReady erzeugt und serviert den Digitalen Produktpass (DPP) nach ESPR für Textilien.
Der Pass hängt an der GTIN (GS1 Digital Link), wird von den Lieferanten befüllt
(Weberei, Färberei, Konfektion) und liefert jeder Rolle genau die Daten, die sie sehen darf.

Was das Backend kann:

- **Komponente A, Datenmodell**: strikte Pydantic-Schemas für Identifier (GTIN, Charge,
  Serial), Faserzusammensetzung mit Rezyklatanteil, Umweltfußabdruck, Chemie-Konformität
  (REACH-SVHC, PFAS), Zertifikate, Pflege, Reparatur, End-of-Life, Audit-Trail.
- **Komponente B, Resolver**: `GET /01/{gtin}[/10/{batch}][/21/{serial}]` mit
  rollenbasiertem Routing (`?role=consumer|recycler|authority`), hierarchischem Fallback
  (Einzelstück, Charge, Modell), Linkset, JSON-LD, Browser-Redirect, Scan-Zählung.
- **Komponente C, Lieferantenportal**: `POST /api/dpp/{gtin}/supplier-update` mit
  Einladungs-Token; jede Lieferantenrolle darf nur ihre Abschnitte ändern, jede Änderung
  wird mit SHA-256 protokolliert, das Aggregat wird komplett re-validiert.
- **Brand-API**: Pass anlegen, Lieferanten einladen, Lückenbericht, Chemie-Check, Publish.
- **Frontend** (`frontend/`, Vite + React + TypeScript): Pass-Ansicht als Ziel des QR-Codes
  mit Tabs Kundinnen/Recycler, Lieferantenformular per Token-Link, Label-Dashboard.
  Editoriales Design ohne Komponenten-Framework, hell und dunkel, WCAG 2.2 AA (axe-core
  ohne Verstöße, Kontraste mindestens 4,5:1, vollständig per Tastatur bedienbar).

Normen und Rechtsgrundlagen pro Feld und Endpunkt: [docs/normen-mapping.md](docs/normen-mapping.md).

## Schnellstart

```bash
python3.11 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Swagger-UI: <http://localhost:8000/docs>. Die App startet mit Demo-Daten (abschaltbar über
`PASSREADY_SEED_DEMO_DATA=false`, alle Variablen in `.env.example`).

Frontend (Node 20, Backend muss auf Port 8000 laufen):

```bash
cd frontend && npm install && npm run dev
```

Dann <http://localhost:5173>: Startseite mit Links zu Demo-Pass, Lieferantenformularen und
Dashboard. Vite proxied `/api` und `/resolver` auf das Backend. In Produktion zeigen
`VITE_API_BASE` und `VITE_RESOLVER_BASE` auf die gehosteten Dienste, das Backend erlaubt den
Frontend-Origin über `PASSREADY_CORS_ORIGINS`. Nach Schema-Änderungen `npm run gen:api`.

### Demo-Daten

| Objekt | Wert |
|---|---|
| T-Shirt, veröffentlicht (Modell + Charge) | GTIN `04012345678901`, Charge `LOT2026A` |
| Denim-Jacke, wartet auf Lieferanten | GTIN `04012345000016` |
| Token Weberei (Jacke) | `demo-token-weaving-2026` |
| Token Färberei (Jacke) | `demo-token-dyeing-2026` |
| Brand-API-Key | `demo-brand-key` (Header `X-API-Key`) |
| Behörden-Key | `demo-authority-key` (Header `X-API-Key` plus `?role=authority`) |

## Beispielaufrufe

Verbraucher scannt den QR-Code (Standardrolle):

```bash
curl -s http://localhost:8000/01/04012345678901/10/LOT2026A | jq .
```

Recycler und Marktaufsicht sehen andere Sichten derselben URL:

```bash
curl -s "http://localhost:8000/01/04012345678901?role=recycler" | jq .compositions
```

```bash
curl -s "http://localhost:8000/01/04012345678901?role=authority" -H "X-API-Key: demo-authority-key" | jq .completeness
```

Linkset und JSON-LD:

```bash
curl -s "http://localhost:8000/01/04012345678901?linkType=linkset" | jq .
```

```bash
curl -s http://localhost:8000/01/04012345678901 -H "Accept: application/ld+json" | jq '."@context"'
```

Weberei liefert die Faserzusammensetzung der Jacke:

```bash
curl -s -X POST http://localhost:8000/api/dpp/04012345000016/supplier-update \
  -H "X-Supplier-Token: demo-token-weaving-2026" -H "Content-Type: application/json" \
  -d '{"fiber_compositions":[{"component":"main_fabric","fibers":[{"fiber":"cotton","percentage":98,"recycled_percentage":25,"recycled_source":"post_consumer","origin_country":"TR"},{"fiber":"elastane","percentage":2}]}],"note":"12 oz denim"}' | jq .
```

Färberei liefert die Chemie-Erklärung, danach kann das Label veröffentlichen:

```bash
curl -s -X POST http://localhost:8000/api/dpp/04012345000016/supplier-update \
  -H "X-Supplier-Token: demo-token-dyeing-2026" -H "Content-Type: application/json" \
  -d '{"chemical_compliance":{"reach_svhc_above_threshold":false,"substances_of_concern":[],"pfas_free":true,"pfas_declaration_url":"https://maviboya.example/pfas.pdf"}}' | jq .status
```

```bash
curl -s -X POST http://localhost:8000/api/dpp/04012345000016/publish -H "X-API-Key: demo-brand-key" | jq .status
```

Was dem Pass noch fehlt, wer es liefern muss und auf welcher Rechtsgrundlage:

```bash
curl -s http://localhost:8000/api/dpp/04012345000016/completeness -H "X-API-Key: demo-brand-key" | jq .missing
```

## Projektstruktur

```
app/
  core/          Settings, GS1-Regeln (Prüfziffer, AI 10/21, Digital-Link-URI), Fehler, Dependencies
  models/        Pydantic-Schema (passport.py = Aggregat), Rollen-Sichten, Lieferanten-Vertrag
  repositories/  Protocol + In-Memory-Implementierung (JSON-Dokumente wie in JSONB)
  services/      Resolver, View-Builder, Supplier-Update, Brand-Workflow, Completeness, Chemie
  routers/       FastAPI-Endpunkte (resolver, supplier, dpp, health)
db/schema.sql    PostgreSQL-Schema (JSONB, Versionshistorie, Tokens, Scan-Log)
docs/            Normen-Mapping
tests/           pytest (Resolver-Routing, Supplier-Flow, Modelle, GS1)
frontend/src/
  api/           generierte OpenAPI-Typen + typisierter Client
  lib/           deutsche Labels für alle Enums
  pages/         PassportPage (/01/...), SupplierPage (/supplier/:gtin), BrandPage (/brand)
```

## Qualität

```bash
.venv/bin/pytest
.venv/bin/ruff check app tests
.venv/bin/mypy
```

## Noch offen (nach dem MVP)

PostgreSQL-Repository auf Basis von `db/schema.sql`, echte Authentifizierung (OAuth2/JWT,
Verifiable Credentials), QR-Code-Export für Etiketten, Versionsabruf-API, Anbindung an das
EU-DPP-Register (ESPR Art. 12), ECHA-Kandidatenliste als Import, Pass-Anlage im Dashboard,
Frontend-Tests, Deployment.
