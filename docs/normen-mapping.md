# Normen-Mapping: So setzt PassReady ESPR, CEN-CLC/JTC 24 und GS1 um

Stand 2026-11-04. Dieses Dokument verbindet die Anforderungen aus Verordnung, Normen und
GS1-Standards mit dem Code des MVP. Status-Legende: **erfüllt** (im MVP umgesetzt und getestet),
**teilweise** (Struktur vorhanden, Rest offen), **offen** (bewusst noch nicht gebaut).

Hinweis zur Begriffswahl: Die DPP-Systemnormen kommen nicht von ISO, sondern vom gemeinsamen
Komitee CEN-CLC/JTC 24 (Nummern EN 18216 bis 18246, Stand prEN, Veröffentlichung 2026
erwartet). ISO-Normen werden von diesen Normen und von der ESPR referenziert; Abschnitt 4
listet, welche davon im Datenmodell stecken.

## 1. Rechtsrahmen: ESPR (VO (EU) 2024/1781)

| Artikel | Anforderung | Umsetzung im MVP | Code | Status |
|---|---|---|---|---|
| Art. 9 | Ein DPP pro Produkt; Granularität (Modell, Charge, Einzelstück) legt der delegierte Rechtsakt fest | `Granularity` wird aus GTIN/Charge/Serial abgeleitet; Speicherschlüssel `(gtin, batch, serial)`; Resolver fällt hierarchisch zurück | `models/identifiers.py`, `repositories/memory.py::resolve` | erfüllt |
| Art. 10(1)(a) | Daten über einen Datenträger am Produkt erreichbar | QR-Inhalt ist eine GS1-Digital-Link-URI auf der Resolver-Domain | `core/gs1.py::build_digital_link`, `routers/resolver.py` | erfüllt (QR-Bild-Export offen) |
| Art. 10(1)(b) | Eindeutige Produktkennung nach ISO/IEC 15459 | GTIN (Prüfziffer geprüft) plus Charge/Serial; zusätzlich `dpp_id` als URN | `core/gs1.py`, `DppIdentifier` | erfüllt |
| Art. 10(1)(c) | Offene Standards, maschinenlesbar, strukturiert, durchsuchbar, übertragbar | JSON-Schema über OpenAPI (`/openapi.json`), JSON-LD mit GS1-Web-Vocabulary | `services/jsonld.py` | erfüllt |
| Art. 10(1)(d) | Zugriffsrechte je Akteur | Drei Rollen mit eigenen Response-Modellen; Behörde braucht Credential | `core/deps.py::resolve_role`, `services/views.py` | erfüllt (MVP-Auth) |
| Art. 10(1)(e) | Speicherung beim Wirtschaftsakteur oder DPP-Dienstleister | Repository-Abstraktion; PostgreSQL-Schema mit Versionshistorie | `repositories/`, `db/schema.sql` | teilweise |
| Art. 10(1)(f) | Authentizität, Zuverlässigkeit, Integrität | Audit-Trail mit SHA-256 je Beitrag; Dokument-Hash je Zertifikat | `ContributionRecord`, `Certificate.document_sha256` | teilweise (Signaturen offen) |
| Art. 10(1)(g) | Verfügbarkeit auch nach Marktaustritt des Herstellers | Backup-Kopie beim Dienstleister vorgesehen | `db/schema.sql::dpp_version` | offen |
| Art. 11 | Technische Gestaltung per delegiertem Rechtsakt | Pflichtfeld-Regeln als Daten mit Quellenangabe, punktgenau änderbar | `services/completeness.py::RULES` | erfüllt (Annahme) |
| Art. 12 | EU-DPP-Register speichert nur Kennungen | Alle Register-Kennungen liegen vor: `dpp_id`, GTIN, EORI, GLN, Facility-GLN | `DppIdentifier`, `EconomicOperator`, `Supplier.facility_gln` | offen (Register-API gibt es noch nicht) |
| Art. 13 | Zollkontrolle über Register und Warennummer | TARIC-Code und EORI sind Pflichtfelder vor Publish | `ProductInfo.taric_code`, `EconomicOperator.eori` | erfüllt |
| Art. 7(5), Art. 2(27)(28) | Besorgniserregende Stoffe nachverfolgen | `ChemicalCompliance` mit SVHC-Liste, Konzentration, Ort; Konsistenz-Validator (0,1 %-Schwelle, REACH Art. 33) | `models/chemistry.py` | erfüllt |

### Annex III (Inhalte des DPP)

| Buchstabe | Inhalt | Feld |
|---|---|---|
| (a) | Informationen nach Art. 7(2)(b) und 7(5) | `fiber_compositions`, `environmental_footprint`, `chemical_compliance`, `care_and_durability`, `end_of_life` |
| (b) | Eindeutige Produktkennung | `identifier.dpp_id`, `identifier.serial` |
| (c) | GTIN oder gleichwertig | `identifier.gtin` |
| (d) | Warennummer (TARIC) | `product.taric_code` |
| (e) | Konformitätsunterlagen | `certificates` (Typ, Aussteller, Nummer, URL, Hash) |
| (f) | Gebrauchsanleitungen | `care_and_durability.care_symbols`, `care_text`, `repair` |
| (g) | Hersteller inkl. eindeutiger Betreiberkennung | `economic_operator` (EORI oder GLN Pflicht) |
| (h) | Weitere Betreiberkennungen | `suppliers[].supplier_id`, `tier`, `role` |
| (i) | Standortkennungen | `suppliers[].facility_gln`, `product.country_of_origin` |
| (j) | Importeur inkl. EORI | `economic_operator.role = importer`, `eori` |
| (k) | Bevollmächtigter | `economic_operator.role = authorised_representative` |

## 2. CEN-CLC/JTC 24: die acht Systemnormen

| Norm | Gegenstand | Umsetzung | Status |
|---|---|---|---|
| prEN 18219 | Eindeutige Kennungen für Produkt, Akteur, Standort | GTIN-14 + AI (10)/(21) für das Produkt, URN als Pass-ID; EORI/GLN für Akteure; Facility-GLN für Standorte, alle mit Prüfziffer-Validierung | erfüllt |
| prEN 18220 | Datenträger (1D/2D-Code, RFID, NFC), per Smartphone lesbar | QR-Code (ISO/IEC 18004) mit GS1-Digital-Link-URI; derselbe Code ist an der Kasse als GTIN lesbar | teilweise (URI fertig, Bild-Export offen) |
| prEN 18221 | Speicherung, Persistenz, Versionen, Backup | `version` je Pass, Versionstabelle im Schema, stabile Resolver-Domain in Settings | teilweise |
| prEN 18216 | Datenaustausch: Protokolle und Formate | HTTPS/REST, JSON, JSON-LD, `application/linkset+json` | erfüllt |
| prEN 18222 | APIs: Lesen, Versionszugriff, Lifecycle-Aktionen | Resolver-GET mit `X-DPP-Version`-Header; Lifecycle `draft → pending_supplier_data → in_review → published → withdrawn`; Publish-Endpunkt | teilweise (Abruf alter Versionen offen) |
| prEN 18223 | Interoperabilität, gemeinsames Kerndatenmodell | Modularer Schnitt: Kern (Identifier, Akteur, Produkt, Audit) getrennt von Sektor-Teil (Textil: Fasern, Chemie, Pflege) | erfüllt (Struktur) |
| prEN 18239 | Zugriffsrechte, Sicherheit, Need-to-know | Rollen-Sichten; Behörden-Key; Lieferanten-Tokens mit Abschnittsrechten und Ablauf; https-only für alle URLs | erfüllt (MVP-Auth, OAuth2/JWT offen) |
| prEN 18246 | Integrität und Authentizität | SHA-256 über jede Lieferanten-Payload im Audit-Trail; Dokument-Hash je Zertifikat; Aggregat wird nach jedem Merge komplett re-validiert | teilweise (Signaturen, Verifiable Credentials offen) |

## 3. GS1 Digital Link (URI Syntax 1.4, Resolver)

| Element | Regel | Umsetzung |
|---|---|---|
| Primärschlüssel | `/01/{gtin}`; GTIN-8/12/13/14 erlaubt, kanonisch 14-stellig | `normalize_gtin` prüft Prüfziffer (Mod 10, Gewichte 3/1) und füllt auf 14 Stellen |
| Key Qualifier | `/10/{lot}` Charge, `/21/{serial}` Seriennummer, je 1 bis 20 Zeichen aus GS1-Zeichensatz 82 | `validate_ai_value`; Sonderzeichen werden in der URI prozent-kodiert |
| Auflösung | Resolver darf auf weniger spezifische Ebene zurückfallen | `resolve()` prüft Item, dann Charge, dann Modell; Header `X-DPP-Fallback`, `X-DPP-Granularity` |
| Link-Typen | `linkType`-Parameter, Linkset-Antwort mit typisierten Links | `?linkType=linkset` liefert `gs1:defaultLink`, `gs1:pip`, `gs1:sustainabilityInfo`, `gs1:recyclingInfo`, `gs1:certificationInfo` |
| Resolver-Beschreibung | `/.well-known/gs1resolver` | `ResolverService.description()` |
| Kontext | Resolver kann Kontext-Parameter auswerten | `role` ist der Kontext-Parameter für das rollenbasierte Routing |
| Offen | Komprimierte URIs, weitere AIs (22 CPV, 8006 ITIP), Redirect statt Direktauslieferung je Link-Typ | nicht im MVP |

Warum das zwingend ist: Die URL auf dem Etikett bleibt für die Lebensdauer des Produkts gleich.
Wechselt das Label den Dienstleister, ändert sich nur die Weiterleitung hinter der Domain, nicht
der Code auf tausenden Etiketten. Deshalb ist `resolver_base_url` eine Einstellung und kein Code.

## 4. ISO-Normen im Datenmodell

| Norm | Wofür | Wo |
|---|---|---|
| ISO/IEC 15459 | Eindeutige Identifikatoren (von ESPR Art. 10 und prEN 18219 gefordert) | GTIN plus Serial, `dpp_id` als URN |
| ISO/IEC 18004 | QR-Code-Symbologie | Datenträger für die Digital-Link-URI (Export folgt) |
| ISO/IEC 15418, 15434 | GS1 Application Identifiers und Syntax | AI 01, 10, 21 in `core/gs1.py` |
| ISO 3166-1 alpha-2 | Ländercodes | `CountryCode` (Herkunft, Lieferantenländer, Adressen) |
| ISO 3758 | Pflegesymbole | `CareSymbol` |
| ISO 1833 | Quantitative Faseranalyse (Grundlage der Prozentangaben) | `FiberComposition` (Summe 100, Toleranz 1 Punkt) |
| ISO 14067, ISO 14040/44 | Product Carbon Footprint, LCA | `FootprintMethod.ISO_14067`, `LifecycleBoundary` |
| ISO/IEC 27001 | Informationssicherheit im Betrieb | offen (Hosting-Phase) |
| VO (EU) 1007/2011 | Textilfaserbezeichnungen (Anhang I) | `FiberType`, `FIBER_LABELS` |

## 5. Rollenbasiertes Routing: wer sieht was

| Datum | Verbraucher | Recycler | Behörde / Zoll |
|---|---|---|---|
| GTIN, Charge, Serial, Digital Link | ja | ja | ja |
| Produktname, Beschreibung, Bilder, Herkunftsland | ja | Name, Kategorie, Gewicht | ja |
| Markenname, Website | ja | Name | alles inkl. EORI, GLN, Adresse, Kontakt |
| Faserzusammensetzung | Faser, Prozent, Rezyklatanteil | voll (inkl. Herkunft, Zertifikatsreferenzen) | voll |
| Besorgniserregende Stoffe | ja/nein plus Stoffnamen | Stoff, CAS, Konzentration, Ort | voll inkl. Erklärer und Zeitpunkt |
| PFAS-Status | ja | ja | ja plus Erklärung |
| Zertifikate | öffentliche, gültige: Typ, Aussteller, URL | wie Verbraucher | alle inkl. Nummer, Inhaber, Hash, Gültigkeit |
| Pflege, Reparatur | ja | nein | ja |
| Umweltfußabdruck | PCF, Methode, verifiziert | nein | voll |
| End-of-Life | Recyclingfähigkeit, Hinweise, Rücknahme | voll inkl. Demontage | voll |
| Lieferanten (Tier 1 bis 3) | nein | nein | ja |
| Audit-Trail, Lückenbericht, Status | Status | Status | alles |
| Nicht veröffentlichter Pass | 404 | 404 | sichtbar |

## 6. Annahmen und offene Punkte

1. **Pflichtfelder Textil sind eine Annahme.** Der delegierte Rechtsakt für Textilien wird laut
   ESPR-Arbeitsplan für Q4 2027 erwartet; die Regeln in `services/completeness.py` folgen der
   JRC-Vorstudie und Annex III. Jede Regel trägt ihre Quelle, damit sie einzeln angepasst wird.
2. **Normen sind prEN.** Die JTC-24-Texte liegen als Entwürfe vor. Nummern und Zuschnitt
   stimmen mit der Präsentation `../DPP/DPP_Praesentation.pptx` überein; Details können sich
   bis zur Veröffentlichung ändern.
3. **Register und Zoll-API existieren noch nicht.** Das MVP hält alle Kennungen bereit, die das
   Register laut Art. 12 verlangt; die Anbindung folgt, sobald die Kommission die Schnittstelle
   veröffentlicht.
4. **Authentifizierung ist ein Platzhalter.** API-Keys und Einladungs-Tokens zeigen das
   Rechtemodell; produktiv kommen OAuth2/JWT für Labels und Behörden, Tokens bleiben für
   Lieferanten das richtige Werkzeug (kein Account nötig).
5. **Chemie-Referenzliste ist ein Demo-Auszug** (16 verifizierte CAS-Nummern). Produktiv wird
   die ECHA-Kandidatenliste importiert; die Screening-Logik bleibt gleich.
6. **Pay-per-Scan zählt bereits**, filtert aber noch keine Bots und Kassen-Scans. Behörden- und
   Recycler-Zugriffe sind per Modell nie abrechenbar (`FREE_ROLES`).
7. **PostgreSQL** ist als Schema vorbereitet (`db/schema.sql`), das Repository läuft im MVP
   in-memory mit identischen JSON-Dokumenten.
