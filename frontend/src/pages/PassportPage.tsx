/** Passport page: what a consumer (or recycler) sees after scanning the QR code. */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  ApiError,
  type ConsumerPassportView,
  type RecyclerPassportView,
  type Role,
  resolvePassport,
  type PassportView,
} from "../api/client";
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

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; view: PassportView };

export function PassportPage() {
  const { gtin = "", batch, serial } = useParams();
  const [role, setRole] = useState<Role>("consumer");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    resolvePassport(gtin, batch, serial, role)
      .then((view) => {
        if (!cancelled) setState({ status: "ready", view });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
  }, [gtin, batch, serial, role]);

  return (
    <main className="page">
      <div className="row between">
        <p className="eyebrow">Digitaler Produktpass</p>
        <div className="segmented" role="tablist" aria-label="Sicht wählen">
          <button type="button" className={role === "consumer" ? "active" : ""} onClick={() => setRole("consumer")}>
            Verbraucher
          </button>
          <button type="button" className={role === "recycler" ? "active" : ""} onClick={() => setRole("recycler")}>
            Recycler
          </button>
        </div>
      </div>

      {state.status === "loading" && <div className="card empty">Pass wird geladen …</div>}
      {state.status === "error" && <ErrorCard error={state.error} gtin={gtin} />}
      {state.status === "ready" && state.view.role === "consumer" && <ConsumerView view={state.view} />}
      {state.status === "ready" && state.view.role === "recycler" && <RecyclerView view={state.view} />}
    </main>
  );
}

function HeroImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="hero-image" src={src} alt={alt} onError={() => setFailed(true)} />;
}

function ErrorCard({ error, gtin }: { error: Error; gtin: string }) {
  let title = "Pass konnte nicht geladen werden";
  let text = error.message;
  if (error instanceof ApiError) {
    if (error.code === "passport_not_published") {
      title = "Dieser Pass ist noch nicht veröffentlicht";
      text = "Das Label sammelt noch Daten bei seinen Lieferanten. Bitte später erneut scannen.";
    } else if (error.code === "passport_not_found") {
      title = "Kein Produktpass hinterlegt";
      text = `Für die GTIN ${gtin} liegt kein Digitaler Produktpass vor.`;
    } else if (error.code === "invalid_identifier") {
      title = "Ungültige Kennung";
    }
  }
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{text}</p>
    </section>
  );
}

function Header({ view, brandName, category, country }: { view: PassportView; brandName: string; category: string; country: string | null | undefined }) {
  const { identifier, resolution } = view;
  const published = view.status === "published";
  return (
    <section className="card">
      <div className="row between">
        <span className="chip accent">{category}</span>
        <span className={`chip ${published ? "ok" : "warn"}`}>{STATUS_LABELS[view.status]}</span>
      </div>
      <h1 className="hero-title">{"product" in view ? view.product.name : ""}</h1>
      <p className="muted">
        {brandName}
        {country ? ` · hergestellt in ${country}` : ""}
      </p>
      <dl className="kv" style={{ marginTop: 12 }}>
        <dt>GTIN</dt>
        <dd><code>{identifier.gtin}</code></dd>
        {identifier.batch && (<><dt>Charge</dt><dd><code>{identifier.batch}</code></dd></>)}
        {identifier.serial && (<><dt>Seriennummer</dt><dd><code>{identifier.serial}</code></dd></>)}
      </dl>
      {resolution.fallback && (
        <p className="alert warn small" style={{ marginTop: 12 }}>
          Für {resolution.requested_serial ? `Seriennummer ${resolution.requested_serial}` : `Charge ${resolution.requested_batch}`} liegt
          kein eigener Pass vor. Angezeigt wird der Pass der {resolution.served_granularity === "batch" ? "Charge" : "Modellebene"}.
        </p>
      )}
    </section>
  );
}

function ConsumerView({ view }: { view: ConsumerPassportView }) {
  const { product, brand, composition, care, environment, chemistry, certificates, end_of_life } = view;
  return (
    <>
      {product.image_urls[0] && <HeroImage src={product.image_urls[0]} alt={product.name} />}
      <Header view={view} brandName={brand.name} category={CATEGORY_LABELS[product.category]} country={product.country_of_origin} />
      {product.description && (
        <section className="card soft"><p>{product.description}</p></section>
      )}

      <section className="card">
        <h2>Material</h2>
        <div className="stack">
          {composition.map((part) => (
            <div key={part.component} className="stack">
              {composition.length > 1 && <h3>{componentLabel(part.component)}</h3>}
              {part.fibers.map((fiber) => (
                <div className="fiber" key={`${part.component}-${fiber.fiber}-${fiber.label}`}>
                  <div className="fiber-line">
                    <span>
                      {FIBER_LABELS[fiber.fiber] === "Sonstige Faser" ? fiber.label : FIBER_LABELS[fiber.fiber]}
                      {fiber.recycled_percentage > 0 && (
                        <span className="chip ok" style={{ marginLeft: 8 }}>{formatPercent(fiber.recycled_percentage)} recycelt</span>
                      )}
                    </span>
                    <strong>{formatPercent(fiber.percentage)}</strong>
                  </div>
                  <div className="bar"><span style={{ width: `${fiber.percentage}%` }} /></div>
                </div>
              ))}
              <p className="small muted">Rezyklatanteil gesamt: {formatPercent(part.total_recycled_percentage)}</p>
            </div>
          ))}
          {composition.length === 0 && <p className="muted">Keine Materialangaben hinterlegt.</p>}
        </div>
      </section>

      {chemistry && (
        <section className="card">
          <h2>Chemie und Stoffe</h2>
          <div className="row">
            <span className={`chip ${chemistry.contains_substances_of_concern ? "warn" : "ok"}`}>
              {chemistry.contains_substances_of_concern ? "Besorgniserregende Stoffe enthalten" : "Keine besorgniserregenden Stoffe"}
            </span>
            <span className={`chip ${chemistry.pfas_free ? "ok" : "warn"}`}>{chemistry.pfas_free ? "PFAS-frei" : "Enthält PFAS"}</span>
          </div>
          {chemistry.substances.length > 0 && (
            <p className="small muted" style={{ marginTop: 8 }}>Gemeldet: {chemistry.substances.join(", ")}</p>
          )}
        </section>
      )}

      {care && (
        <section className="card">
          <h2>Pflege und Reparatur</h2>
          <div className="row">
            {care.care_symbols.map((symbol) => <span key={symbol} className="chip">{CARE_LABELS[symbol]}</span>)}
          </div>
          {care.care_text && <p className="small muted" style={{ marginTop: 8 }}>{care.care_text}</p>}
          {(care.repair_instructions_url || care.spare_parts_available !== null) && (
            <dl className="kv" style={{ marginTop: 10 }}>
              {care.repair_instructions_url && (<><dt>Reparatur</dt><dd><a href={care.repair_instructions_url}>Anleitung öffnen</a></dd></>)}
              {care.spare_parts_available !== null && (<><dt>Ersatzteile</dt><dd>{care.spare_parts_available ? "verfügbar" : "nicht verfügbar"}</dd></>)}
            </dl>
          )}
        </section>
      )}

      {environment && (
        <section className="card">
          <h2>Umweltfußabdruck</h2>
          <div className="row between">
            <span><strong style={{ fontSize: "1.4rem" }}>{environment.pcf_kg_co2e}</strong> kg CO₂e pro Stück</span>
            <span className={`chip ${environment.verified ? "ok" : ""}`}>{environment.verified ? "verifiziert" : "Eigenangabe"}</span>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            {METHOD_LABELS[environment.method]}, {BOUNDARY_LABELS[environment.boundary]}
          </p>
        </section>
      )}

      <Certificates certificates={certificates} />

      {end_of_life && (
        <section className="card">
          <h2>Kreislauf</h2>
          <dl className="kv">
            {end_of_life.recyclable !== null && (<><dt>Recycelbar</dt><dd>{end_of_life.recyclable ? "ja" : "nein"}</dd></>)}
            {end_of_life.recycling_notes && (<><dt>Hinweis</dt><dd>{end_of_life.recycling_notes}</dd></>)}
            {end_of_life.take_back_program_url && (<><dt>Rücknahme</dt><dd><a href={end_of_life.take_back_program_url}>Zum Rücknahmeprogramm</a></dd></>)}
          </dl>
        </section>
      )}

      <Footer view={view} brandWebsite={brand.website} />
    </>
  );
}

function RecyclerView({ view }: { view: RecyclerPassportView }) {
  const { product, compositions, substances_of_concern, pfas_free, end_of_life, certificates } = view;
  return (
    <>
      <Header view={view} brandName={view.brand_name} category={CATEGORY_LABELS[product.category]} country={null} />
      <section className="card">
        <h2>Produkt</h2>
        <dl className="kv">
          {product.weight_g !== null && (<><dt>Gewicht</dt><dd>{product.weight_g} g</dd></>)}
          <dt>Monomaterial</dt>
          <dd>{product.mono_material === null ? "keine Angabe" : product.mono_material ? "ja" : "nein"}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Faserzusammensetzung</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Teil</th><th>Faser</th><th>Anteil</th><th>Rezyklat</th><th>Herkunft</th></tr></thead>
            <tbody>
              {compositions.flatMap((part) =>
                part.fibers.map((fiber, index) => (
                  <tr key={`${part.component}-${index}`}>
                    <td>{componentLabel(part.component)}</td>
                    <td>{fiber.fiber === "other" ? fiber.fiber_name_other : FIBER_LABELS[fiber.fiber]}</td>
                    <td>{formatPercent(fiber.percentage)}</td>
                    <td>
                      {fiber.recycled_percentage > 0
                        ? `${formatPercent(fiber.recycled_percentage)}${fiber.recycled_source ? ` (${RECYCLED_SOURCE_LABELS[fiber.recycled_source]})` : ""}`
                        : "–"}
                    </td>
                    <td>{fiber.origin_country ?? "–"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {compositions.length === 0 && <p className="muted">Keine Materialangaben hinterlegt.</p>}
      </section>

      <section className="card">
        <h2>Besorgniserregende Stoffe</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className={`chip ${pfas_free === false ? "warn" : pfas_free ? "ok" : ""}`}>
            {pfas_free === null ? "PFAS: keine Angabe" : pfas_free ? "PFAS-frei" : "Enthält PFAS"}
          </span>
        </div>
        {substances_of_concern.length === 0 ? (
          <p className="muted">Keine Stoffe über der Meldeschwelle (REACH Art. 33, 0,1 % w/w).</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Stoff</th><th>CAS</th><th>Konz.</th><th>Ort</th></tr></thead>
              <tbody>
                {substances_of_concern.map((substance, index) => (
                  <tr key={index}>
                    <td>{substance.name}</td>
                    <td><code>{substance.cas_number ?? "–"}</code></td>
                    <td>{substance.concentration_percent} %</td>
                    <td>{substance.location ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {end_of_life && (
        <section className="card">
          <h2>Demontage und Recycling</h2>
          <dl className="kv">
            {end_of_life.recyclable !== null && (<><dt>Recycelbar</dt><dd>{end_of_life.recyclable ? "ja" : "nein"}</dd></>)}
            {end_of_life.disassembly_instructions && (<><dt>Demontage</dt><dd>{end_of_life.disassembly_instructions}</dd></>)}
            {end_of_life.recycling_notes && (<><dt>Hinweis</dt><dd>{end_of_life.recycling_notes}</dd></>)}
          </dl>
        </section>
      )}

      <Certificates certificates={certificates} />
      <Footer view={view} brandWebsite={null} />
    </>
  );
}

function Certificates({ certificates }: { certificates: PassportView["certificates"] }) {
  if (certificates.length === 0) return null;
  return (
    <section className="card">
      <h2>Zertifikate</h2>
      <ul className="list">
        {certificates.map((certificate, index) => (
          <li key={index}>
            <div>
              <strong>{CERTIFICATE_LABELS[certificate.type]}</strong>
              <div className="small muted">
                {certificate.issuer}
                {certificate.valid_until ? ` · gültig bis ${formatDate(certificate.valid_until)}` : ""}
              </div>
            </div>
            {certificate.url && <a className="btn small" href={certificate.url}>Nachweis</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ view, brandWebsite }: { view: PassportView; brandWebsite: string | null }) {
  const publishedAt = "published_at" in view ? view.published_at : null;
  return (
    <p className="footer-note">
      Version {view.version}
      {publishedAt ? `, veröffentlicht am ${formatDate(publishedAt)}` : ""}
      {brandWebsite ? <> · <a href={brandWebsite}>Website des Labels</a></> : null}
      <br />
      <code className="tiny">{view.identifier.digital_link}</code>
      <br />
      Daten nach EU-Ökodesign-Verordnung (ESPR), bereitgestellt über GS1 Digital Link.
    </p>
  );
}
