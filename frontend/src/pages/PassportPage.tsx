/** Passport page: what a consumer (or recycler) sees after scanning the QR code. */

import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  ApiError,
  type ConsumerPassportView,
  type PassportView,
  type RecyclerPassportView,
  type Role,
  resolvePassport,
} from "../api/client";
import { countryName, usePageTitle } from "../lib/a11y";
import {
  BOUNDARY_LABELS,
  CARE_LABELS,
  CATEGORY_LABELS,
  CERTIFICATE_LABELS,
  FIBER_LABELS,
  METHOD_LABELS,
  RECYCLED_SOURCE_LABELS,
  STATUS_LABELS,
  componentLabel,
  formatDate,
  formatPercent,
} from "../lib/labels";

const TABS: { id: Role; label: string }[] = [
  { id: "consumer", label: "Für Kundinnen und Kunden" },
  { id: "recycler", label: "Für Recycler" },
];

export function PassportPage() {
  const { gtin = "", batch, serial } = useParams();
  const [role, setRole] = useState<Role>("consumer");
  const [view, setView] = useState<PassportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  usePageTitle(view ? view.product.name : "Produktpass");

  // The previous view stays mounted while the next role loads, so keyboard focus on the
  // tab list survives the switch and the page does not flicker.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolvePassport(gtin, batch, serial, role)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setView(null);
          setError(caught instanceof Error ? caught : new Error(String(caught)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gtin, batch, serial, role]);

  return (
    <main id="main" tabIndex={-1} className="wrap">
      <p className="eyebrow">Digitaler Produktpass</p>
      {loading && !view && (
        <p role="status" className="muted" style={{ marginTop: "1rem" }}>Pass wird geladen …</p>
      )}
      {error && <ErrorBlock error={error} gtin={gtin} />}
      {view && (
        <>
          <PassHeader view={view} />
          <RoleTabs role={role} onChange={setRole} />
          <div role="tabpanel" id={`panel-${view.role}`} aria-labelledby={`tab-${view.role}`} aria-busy={loading}>
            {view.role === "consumer" ? <ConsumerSections view={view} /> : <RecyclerSections view={view} />}
          </div>
          <PassFooter view={view} />
        </>
      )}
    </main>
  );
}

function RoleTabs({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === role);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
  };
  return (
    <div role="tablist" aria-label="Sicht auf den Pass" className="tabs" onKeyDown={onKeyDown}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          type="button"
          className="tab"
          aria-selected={role === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={role === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ErrorBlock({ error, gtin }: { error: Error; gtin: string }) {
  let title = "Pass konnte nicht geladen werden";
  let text = error.message;
  if (error instanceof ApiError) {
    if (error.code === "passport_not_published") {
      title = "Dieser Pass ist noch nicht veröffentlicht";
      text = "Das Label sammelt noch Daten bei seinen Lieferanten. Bitte den Code später erneut scannen.";
    } else if (error.code === "passport_not_found") {
      title = "Kein Produktpass hinterlegt";
      text = `Für die GTIN ${gtin} liegt kein Digitaler Produktpass vor.`;
    } else if (error.code === "invalid_identifier") {
      title = "Ungültige Kennung";
    }
  }
  return (
    <section role="alert" aria-labelledby="err-title" style={{ marginTop: "1rem" }}>
      <h1 id="err-title" className="display">{title}</h1>
      <p className="lede">{text}</p>
    </section>
  );
}

function PassHeader({ view }: { view: PassportView }) {
  const { identifier, resolution } = view;
  const product = view.product;
  const brandName = view.role === "consumer" ? view.brand.name : view.brand_name;
  const country = view.role === "consumer" ? view.product.country_of_origin : null;
  const images = view.role === "consumer" ? view.product.image_urls : [];
  const published = view.status === "published";
  return (
    <header className="pass-head">
      <h1 className="display">{product.name}</h1>
      <p className="lede">
        {brandName} · {CATEGORY_LABELS[product.category]}
        {country ? ` · hergestellt in ${countryName(country)}` : ""}
      </p>
      {images.length > 0 && <Gallery images={images} name={product.name} />}
      <dl className="facts">
        <dt>GTIN</dt>
        <dd><code>{identifier.gtin}</code></dd>
        {identifier.batch && (<><dt>Charge</dt><dd><code>{identifier.batch}</code></dd></>)}
        {identifier.serial && (<><dt>Seriennummer</dt><dd><code>{identifier.serial}</code></dd></>)}
        <dt>Status</dt>
        <dd><span className={`status ${published ? "status-ok" : "status-warn"}`}>{STATUS_LABELS[view.status]}</span></dd>
      </dl>
      {resolution.fallback && (
        <p className="notice notice-warn" style={{ marginTop: "1rem" }}>
          Für {resolution.requested_serial ? `die Seriennummer ${resolution.requested_serial}` : `die Charge ${resolution.requested_batch}`} gibt es
          keinen eigenen Pass. Angezeigt werden die Angaben {resolution.served_granularity === "batch" ? "der Charge" : "des Modells"}.
        </p>
      )}
    </header>
  );
}

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const available = images.filter((url) => !failed.has(url));
  if (available.length === 0) return null;
  const current = available[Math.min(index, available.length - 1)];
  const position = available.indexOf(current) + 1;
  return (
    <figure className="gallery">
      <img
        className="pass-image"
        src={current}
        alt={`Produktbild ${position} von ${available.length}: ${name}`}
        onError={() => setFailed((previous) => new Set(previous).add(current))}
      />
      {available.length > 1 && (
        <ul className="gallery-thumbs" aria-label="Weitere Produktbilder">
          {available.map((url, i) => (
            <li key={url}>
              <button type="button" aria-pressed={url === current} aria-label={`Bild ${i + 1} anzeigen`} onClick={() => setIndex(i)}>
                <img src={url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function Section({ num, title, id, children }: { num: string; title: string; id: string; children: ReactNode }) {
  return (
    <section className="section" aria-labelledby={`h-${id}`}>
      <div className="section-title">
        <span className="num" aria-hidden="true">{num}</span>
        <h2 id={`h-${id}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

interface FiberShare { label: string; percentage: number; recycled: number; note?: string }

function CompositionBar({ fibers }: { fibers: FiberShare[] }) {
  const description = fibers.map((f) => `${f.label} ${formatPercent(f.percentage)}`).join(", ");
  return (
    <>
      <div className="compbar" role="img" aria-label={`Zusammensetzung: ${description}`}>
        {fibers.map((fiber, index) => (
          <span key={index} className={`seg seg-${index % 6}`} style={{ flexBasis: `${fiber.percentage}%` }} />
        ))}
      </div>
      <ul className="legend">
        {fibers.map((fiber, index) => (
          <li key={index}>
            <span className={`swatch seg-${index % 6}`} aria-hidden="true" />
            <span>{fiber.label}</span>
            <span className="legend-pct">{formatPercent(fiber.percentage)}</span>
            {(fiber.recycled > 0 || fiber.note) && (
              <span className="legend-note">
                {fiber.recycled > 0 ? `davon ${formatPercent(fiber.recycled)} recycelt` : ""}
                {fiber.recycled > 0 && fiber.note ? " · " : ""}
                {fiber.note ?? ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function ConsumerSections({ view }: { view: ConsumerPassportView }) {
  const { product, composition, care, environment, chemistry, certificates, end_of_life } = view;
  return (
    <>
      {product.description && <p className="lede" style={{ marginTop: "1.25rem" }}>{product.description}</p>}

      <Section num="01" title="Material" id="material">
        {composition.length === 0 && <p className="muted">Keine Materialangaben hinterlegt.</p>}
        {composition.map((part) => (
          <div key={part.component}>
            {composition.length > 1 && <h3 className="part-title">{componentLabel(part.component)}</h3>}
            <CompositionBar
              fibers={part.fibers.map((fiber) => ({
                label: fiber.fiber === "other" ? fiber.label : FIBER_LABELS[fiber.fiber],
                percentage: fiber.percentage,
                recycled: fiber.recycled_percentage,
              }))}
            />
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              Rezyklatanteil dieses Teils: {formatPercent(part.total_recycled_percentage)}
            </p>
          </div>
        ))}
      </Section>

      {chemistry && (
        <Section num="02" title="Chemie und Stoffe" id="chemistry">
          <ul className="status-list">
            <li>
              <span className={`status ${chemistry.contains_substances_of_concern ? "status-warn" : "status-ok"}`}>
                {chemistry.contains_substances_of_concern
                  ? "Enthält besorgniserregende Stoffe"
                  : "Keine besorgniserregenden Stoffe gemeldet"}
              </span>
            </li>
            <li>
              <span className={`status ${chemistry.pfas_free ? "status-ok" : "status-warn"}`}>
                {chemistry.pfas_free ? "Ohne absichtlich zugesetzte PFAS" : "Enthält PFAS"}
              </span>
            </li>
          </ul>
          {chemistry.substances.length > 0 && (
            <p className="small muted" style={{ marginTop: "0.75rem" }}>Gemeldet: {chemistry.substances.join(", ")}</p>
          )}
        </Section>
      )}

      {care && (
        <Section num="03" title="Pflege und Reparatur" id="care">
          {care.care_symbols.length > 0 && (
            <ul className="status-list" aria-label="Pflegehinweise">
              {care.care_symbols.map((symbol) => <li key={symbol}>{CARE_LABELS[symbol]}</li>)}
            </ul>
          )}
          {care.care_text && <p className="muted" style={{ marginTop: "0.75rem" }}>{care.care_text}</p>}
          {(care.repair_instructions_url || care.spare_parts_available !== null) && (
            <dl className="kv" style={{ marginTop: "1rem" }}>
              {care.repair_instructions_url && (
                <><dt>Reparatur</dt><dd><a href={care.repair_instructions_url}>Reparaturanleitung öffnen</a></dd></>
              )}
              {care.spare_parts_available !== null && (
                <><dt>Ersatzteile</dt><dd>{care.spare_parts_available ? "verfügbar" : "nicht verfügbar"}</dd></>
              )}
            </dl>
          )}
        </Section>
      )}

      {environment && (
        <Section num="04" title="Umweltfußabdruck" id="environment">
          <p>
            <strong style={{ fontSize: "1.5rem", fontFamily: "var(--serif)", fontWeight: 500 }}>{environment.pcf_kg_co2e}</strong>
            {" "}kg CO₂-Äquivalent pro Stück
          </p>
          <p className="small muted" style={{ marginTop: "0.25rem" }}>
            {METHOD_LABELS[environment.method]}, {BOUNDARY_LABELS[environment.boundary]},{" "}
            {environment.verified ? "von Dritten verifiziert" : "Eigenangabe des Labels"}
          </p>
        </Section>
      )}

      <CertificateSection num="05" certificates={certificates} />

      {end_of_life && (
        <Section num="06" title="Kreislauf" id="eol">
          <dl className="kv">
            {end_of_life.recyclable !== null && (<><dt>Recycelbar</dt><dd>{end_of_life.recyclable ? "ja" : "nein"}</dd></>)}
            {end_of_life.recycling_notes && (<><dt>Hinweis</dt><dd>{end_of_life.recycling_notes}</dd></>)}
            {end_of_life.take_back_program_url && (
              <><dt>Rücknahme</dt><dd><a href={end_of_life.take_back_program_url}>Zum Rücknahmeprogramm</a></dd></>
            )}
          </dl>
        </Section>
      )}
    </>
  );
}

function RecyclerSections({ view }: { view: RecyclerPassportView }) {
  const { product, compositions, substances_of_concern, pfas_free, end_of_life, certificates } = view;
  return (
    <>
      <Section num="01" title="Produkt" id="product">
        <dl className="kv">
          {product.weight_g !== null && (<><dt>Gewicht</dt><dd>{product.weight_g} g</dd></>)}
          <dt>Monomaterial</dt>
          <dd>{product.mono_material === null ? "keine Angabe" : product.mono_material ? "ja" : "nein"}</dd>
        </dl>
      </Section>

      <Section num="02" title="Faserzusammensetzung" id="fibres">
        {compositions.length === 0 && <p className="muted">Keine Materialangaben hinterlegt.</p>}
        {compositions.map((part) => (
          <div key={part.component}>
            {compositions.length > 1 && <h3 className="part-title">{componentLabel(part.component)}</h3>}
            <CompositionBar
              fibers={part.fibers.map((fiber) => ({
                label: fiber.fiber === "other" ? (fiber.fiber_name_other ?? "Sonstige Faser") : FIBER_LABELS[fiber.fiber],
                percentage: fiber.percentage,
                recycled: fiber.recycled_percentage,
                note: [
                  fiber.recycled_source ? RECYCLED_SOURCE_LABELS[fiber.recycled_source] : null,
                  fiber.origin_country ? `Herkunft ${countryName(fiber.origin_country)}` : null,
                ].filter(Boolean).join(", ") || undefined,
              }))}
            />
          </div>
        ))}
      </Section>

      <Section num="03" title="Besorgniserregende Stoffe" id="substances">
        <p style={{ marginBottom: "0.75rem" }}>
          <span className={`status ${pfas_free === false ? "status-warn" : pfas_free ? "status-ok" : "status-neutral"}`}>
            {pfas_free === null ? "PFAS: keine Angabe" : pfas_free ? "Ohne absichtlich zugesetzte PFAS" : "Enthält PFAS"}
          </span>
        </p>
        {substances_of_concern.length === 0 ? (
          <p className="muted">Keine Stoffe über der Meldeschwelle von 0,1 % (REACH Art. 33).</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>Gemeldete Stoffe mit CAS-Nummer, Konzentration und Ort im Artikel</caption>
              <thead>
                <tr><th scope="col">Stoff</th><th scope="col">CAS</th><th scope="col" className="num">Konz.</th><th scope="col">Ort</th></tr>
              </thead>
              <tbody>
                {substances_of_concern.map((substance, index) => (
                  <tr key={index}>
                    <td>{substance.name}</td>
                    <td><code>{substance.cas_number ?? "–"}</code></td>
                    <td className="num">{substance.concentration_percent} %</td>
                    <td>{substance.location ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {end_of_life && (
        <Section num="04" title="Demontage und Recycling" id="disassembly">
          <dl className="kv">
            {end_of_life.recyclable !== null && (<><dt>Recycelbar</dt><dd>{end_of_life.recyclable ? "ja" : "nein"}</dd></>)}
            {end_of_life.disassembly_instructions && (<><dt>Demontage</dt><dd>{end_of_life.disassembly_instructions}</dd></>)}
            {end_of_life.recycling_notes && (<><dt>Hinweis</dt><dd>{end_of_life.recycling_notes}</dd></>)}
          </dl>
        </Section>
      )}

      <CertificateSection num="05" certificates={certificates} />
    </>
  );
}

function CertificateSection({ num, certificates }: { num: string; certificates: PassportView["certificates"] }) {
  if (certificates.length === 0) return null;
  return (
    <Section num={num} title="Zertifikate und Nachweise" id="certificates">
      <ul className="link-list">
        {certificates.map((certificate, index) => {
          const label = CERTIFICATE_LABELS[certificate.type];
          const meta = `${certificate.issuer}${certificate.valid_until ? `, gültig bis ${formatDate(certificate.valid_until)}` : ""}`;
          return (
            <li key={index}>
              {certificate.url ? (
                <a href={certificate.url} aria-label={`Nachweis öffnen: ${label}, ${meta}`}>
                  <span><span className="link-title">{label}</span><span className="link-meta">{meta}</span></span>
                </a>
              ) : (
                <div style={{ padding: "0.9rem 0" }}>
                  <span className="link-title">{label}</span><span className="link-meta">{meta}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function PassFooter({ view }: { view: PassportView }) {
  const publishedAt = view.role === "consumer" ? view.published_at : null;
  const website = view.role === "consumer" ? view.brand.website : null;
  return (
    <footer className="pass-foot">
      <p>
        Version {view.version}
        {publishedAt ? `, veröffentlicht am ${formatDate(publishedAt)}` : ""}
        {website ? <> · <a href={website}>Website des Labels</a></> : null}
      </p>
      <p>Adresse des Passes: <code>{view.identifier.digital_link}</code></p>
      <p>Angaben nach der EU-Ökodesign-Verordnung (ESPR), erreichbar über GS1 Digital Link.</p>
    </footer>
  );
}
