/** Supplier form: opened via token link, shows only what this supplier may and should fill in. */

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  ApiError,
  type Certificate,
  type CertificateType,
  type DppSection,
  type FiberType,
  type RecycledSource,
  type SupplierContext,
  type SupplierUpdateRequest,
  type SupplierUpdateResponse,
  supplierContext,
  supplierUpdate,
} from "../api/client";
import {
  CERTIFICATE_LABELS,
  FIBER_LABELS,
  RECYCLED_SOURCE_LABELS,
  ROLE_LABELS,
  SECTION_LABELS,
  STATUS_LABELS,
  formatDate,
  missingLabel,
} from "../lib/labels";

interface FiberRow { id: string; fiber: FiberType; otherName: string; percentage: string; recycled: string; source: RecycledSource | ""; origin: string; certificateId: string }
interface CertRow { id: string; certificateId: string; type: CertificateType; issuer: string; number: string; url: string; validFrom: string; validUntil: string }
interface SubstanceRow { id: string; name: string; cas: string; concentration: string; location: string }

let counter = 0;
const nextId = () => `row-${Date.now().toString(36)}-${(counter += 1)}`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CHEMISTRY_CERT_TYPES: CertificateType[] = ["oeko_tex_standard_100", "oeko_tex_made_in_green", "bluesign", "zdhc_mrsl", "reach_declaration", "pfas_declaration", "test_report"];

type LoadState = { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; context: SupplierContext };

export function SupplierPage() {
  const { gtin = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", error: new Error("Der Link enthält kein Token. Bitte den Einladungslink des Labels verwenden.") });
      return;
    }
    let cancelled = false;
    supplierContext(gtin, token)
      .then((context) => { if (!cancelled) setState({ status: "ready", context }); })
      .catch((error: unknown) => { if (!cancelled) setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) }); });
    return () => { cancelled = true; };
  }, [gtin, token]);

  return (
    <main className="page">
      <p className="eyebrow">Lieferantenportal</p>
      {state.status === "loading" && <div className="card empty">Einladung wird geprüft …</div>}
      {state.status === "error" && (
        <section className="card">
          <h2>Einladung ungültig</h2>
          <p className="muted">{state.error instanceof ApiError && state.error.status === 401 ? "Das Token ist unbekannt, abgelaufen oder zurückgezogen. Bitte beim Label einen neuen Link anfordern." : state.error.message}</p>
        </section>
      )}
      {state.status === "ready" && <SupplierForm gtin={gtin} token={token} context={state.context} />}
    </main>
  );
}

function SupplierForm({ gtin, token, context }: { gtin: string; token: string; context: SupplierContext }) {
  const allowed = new Set<DppSection>(context.allowed_sections);
  const missingPaths = new Set(context.missing_for_me.map((m) => m.path));

  const [includeFibers, setIncludeFibers] = useState(allowed.has("fiber_compositions") && missingPaths.has("fiber_compositions"));
  const [component, setComponent] = useState("main_fabric");
  const [fiberRows, setFiberRows] = useState<FiberRow[]>([
    { id: nextId(), fiber: "cotton", otherName: "", percentage: "100", recycled: "0", source: "", origin: "", certificateId: "" },
  ]);

  const [includeChemistry, setIncludeChemistry] = useState(allowed.has("chemical_compliance") && missingPaths.has("chemical_compliance"));
  const [pfasFree, setPfasFree] = useState(true);
  const [pfasUrl, setPfasUrl] = useState("");
  const [svhcAbove, setSvhcAbove] = useState(false);
  const [reachUrl, setReachUrl] = useState("");
  const [substances, setSubstances] = useState<SubstanceRow[]>([]);

  const [certRows, setCertRows] = useState<CertRow[]>([]);

  const [includeFootprint, setIncludeFootprint] = useState(allowed.has("environmental_footprint") && missingPaths.has("environmental_footprint"));
  const [pcf, setPcf] = useState("");
  const [method, setMethod] = useState<"pef" | "iso_14067" | "ghg_protocol_product" | "other">("pef");
  const [boundary, setBoundary] = useState<"cradle_to_gate" | "cradle_to_grave">("cradle_to_gate");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [water, setWater] = useState("");

  const [includeDetails, setIncludeDetails] = useState(false);
  const [facilityGln, setFacilityGln] = useState(context.supplier.facility_gln ?? "");
  const [contactEmail, setContactEmail] = useState(context.supplier.contact_email ?? "");

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SupplierUpdateResponse | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const fiberTotal = useMemo(() => fiberRows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0), [fiberRows]);
  const fiberTotalOk = Math.abs(fiberTotal - 100) <= 1;

  const updateFiber = (id: string, patch: Partial<FiberRow>) => setFiberRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const updateCert = (id: string, patch: Partial<CertRow>) => setCertRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const updateSubstance = (id: string, patch: Partial<SubstanceRow>) => setSubstances((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const addCert = () => {
    const type: CertificateType = allowed.has("chemical_compliance") ? "oeko_tex_standard_100" : "grs";
    setCertRows((rows) => [...rows, { id: nextId(), certificateId: `cert-${slug(type)}-${slug(context.supplier.name).slice(0, 12)}-${rows.length + 1}`, type, issuer: "", number: "", url: "", validFrom: "", validUntil: "" }]);
  };

  const buildPayload = (): SupplierUpdateRequest => {
    const payload: SupplierUpdateRequest = {};
    const certificates: Certificate[] = certRows.map((row) => ({
      certificate_id: row.certificateId,
      type: row.type,
      issuer: row.issuer,
      number: row.number || null,
      url: row.url || null,
      valid_from: row.validFrom || null,
      valid_until: row.validUntil || null,
      verified: false,
      public: row.type !== "pfas_declaration" && row.type !== "reach_declaration",
    }));
    if (certificates.length > 0) payload.certificates = certificates;
    if (includeFibers) {
      payload.fiber_compositions = [{
        component,
        fibers: fiberRows.map((row) => ({
          fiber: row.fiber,
          fiber_name_other: row.fiber === "other" ? row.otherName : null,
          percentage: Number(row.percentage),
          recycled_percentage: Number(row.recycled) || 0,
          recycled_source: row.source || null,
          origin_country: row.origin ? row.origin.toUpperCase() : null,
          certificate_ids: row.certificateId ? [row.certificateId] : [],
        })),
      }];
    }
    if (includeChemistry) {
      payload.chemical_compliance = {
        reach_svhc_above_threshold: svhcAbove,
        substances_of_concern: substances.map((row) => ({
          name: row.name,
          cas_number: row.cas || null,
          concentration_percent: Number(row.concentration) || 0,
          location: row.location || null,
          svhc_listed: true,
        })),
        pfas_free: pfasFree,
        pfas_declaration_url: pfasUrl || null,
        reach_declaration_url: reachUrl || null,
        certificate_ids: certRows.filter((row) => CHEMISTRY_CERT_TYPES.includes(row.type)).map((row) => row.certificateId),
      };
    }
    if (includeFootprint) {
      payload.environmental_footprint = {
        pcf_kg_co2e: Number(pcf),
        method,
        boundary,
        reference_year: Number(year),
        water_consumption_l: water ? Number(water) : null,
        verified: false,
      };
    }
    if (includeDetails) {
      payload.supplier_details = { facility_gln: facilityGln || null, contact_email: contactEmail || null };
    }
    if (note) payload.note = note;
    return payload;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setResult(await supplierUpdate(gtin, token, buildPayload()));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <section className="card">
        <h2>Daten übermittelt</h2>
        <div className="alert ok">Vielen Dank, {context.supplier.name}. Ihre Angaben sind im Pass angekommen (Version {result.passport_version}).</div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Status des Passes</dt><dd>{STATUS_LABELS[result.status]}</dd>
          <dt>Abschnitte</dt><dd>{result.sections_updated.map((s) => SECTION_LABELS[s]).join(", ")}</dd>
          <dt>Nachweis</dt><dd><code className="tiny">{result.contribution.payload_sha256.slice(0, 16)}…</code> (SHA-256 der Übermittlung)</dd>
        </dl>
        {result.missing_after_update.length > 0 ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            Dem Pass fehlen noch: {result.missing_after_update.map((m) => missingLabel(m)).join(", ")}. Dafür sind andere Beteiligte zuständig.
          </p>
        ) : (
          <p className="small muted" style={{ marginTop: 10 }}>Der Pass ist vollständig und kann vom Label veröffentlicht werden.</p>
        )}
      </section>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>{context.supplier.name}</h2>
          <span className="chip accent">{ROLE_LABELS[context.supplier.role]}</span>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>
          Artikel <strong>{context.product_name}</strong>, GTIN <code>{context.gtin}</code>
          {context.batch ? <>, Charge <code>{context.batch}</code></> : null}. Link gültig bis {formatDate(context.expires_at)}.
        </p>
        {context.missing_for_me.length > 0 ? (
          <div className="alert warn" style={{ marginTop: 10 }}>
            Vom Label angefragt:
            <ul>{context.missing_for_me.map((m) => <li key={m.path}><strong>{missingLabel(m)}</strong> <span className="tiny">({m.source})</span></li>)}</ul>
          </div>
        ) : (
          <div className="alert ok" style={{ marginTop: 10 }}>Für Ihre Rolle fehlen keine Pflichtangaben mehr. Sie können Angaben trotzdem aktualisieren.</div>
        )}
      </section>

      {allowed.has("fiber_compositions") && (
        <section className="card">
          <div className="card-head">
            <h2>Faserzusammensetzung</h2>
            <label className="check"><input type="checkbox" checked={includeFibers} onChange={(e) => setIncludeFibers(e.target.checked)} /> mitsenden</label>
          </div>
          {includeFibers && (
            <div className="stack">
              <label className="field"><span>Bauteil</span>
                <select value={component} onChange={(e) => setComponent(e.target.value)}>
                  <option value="main_fabric">Oberstoff</option><option value="lining">Futter</option><option value="rib_collar">Bündchen</option><option value="trim">Zutaten</option>
                </select>
              </label>
              {fiberRows.map((row) => (
                <div className="fiber-row" key={row.id}>
                  <label className="field"><span>Faser</span>
                    <select value={row.fiber} onChange={(e) => updateFiber(row.id, { fiber: e.target.value as FiberType })}>
                      {(Object.keys(FIBER_LABELS) as FiberType[]).map((fiber) => <option key={fiber} value={fiber}>{FIBER_LABELS[fiber]}</option>)}
                    </select>
                  </label>
                  {row.fiber === "other" && (
                    <label className="field"><span>Bezeichnung</span><input value={row.otherName} onChange={(e) => updateFiber(row.id, { otherName: e.target.value })} required /></label>
                  )}
                  <label className="field"><span>Anteil %</span><input type="number" min="0.1" max="100" step="0.1" value={row.percentage} onChange={(e) => updateFiber(row.id, { percentage: e.target.value })} required /></label>
                  <label className="field"><span>davon recycelt %</span><input type="number" min="0" max="100" step="1" value={row.recycled} onChange={(e) => updateFiber(row.id, { recycled: e.target.value })} /></label>
                  <label className="field"><span>Rezyklat-Quelle</span>
                    <select value={row.source} onChange={(e) => updateFiber(row.id, { source: e.target.value as RecycledSource | "" })}>
                      <option value="">keine Angabe</option>
                      {(Object.keys(RECYCLED_SOURCE_LABELS) as RecycledSource[]).map((source) => <option key={source} value={source}>{RECYCLED_SOURCE_LABELS[source]}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Herkunft (ISO)</span><input value={row.origin} maxLength={2} placeholder="TR" onChange={(e) => updateFiber(row.id, { origin: e.target.value })} /></label>
                  {certRows.length > 0 && (
                    <label className="field"><span>Zertifikat</span>
                      <select value={row.certificateId} onChange={(e) => updateFiber(row.id, { certificateId: e.target.value })}>
                        <option value="">keines</option>
                        {certRows.map((cert) => <option key={cert.id} value={cert.certificateId}>{CERTIFICATE_LABELS[cert.type]}{cert.number ? ` ${cert.number}` : ""}</option>)}
                      </select>
                    </label>
                  )}
                  {fiberRows.length > 1 && <button type="button" className="btn small remove" onClick={() => setFiberRows((rows) => rows.filter((r) => r.id !== row.id))}>Entfernen</button>}
                </div>
              ))}
              <div className="row between">
                <button type="button" className="btn small" onClick={() => setFiberRows((rows) => [...rows, { id: nextId(), fiber: "elastane", otherName: "", percentage: "", recycled: "0", source: "", origin: "", certificateId: "" }])}>Faser hinzufügen</button>
                <span className={`chip ${fiberTotalOk ? "ok" : "danger"}`}>Summe {fiberTotal.toFixed(1)} %</span>
              </div>
            </div>
          )}
        </section>
      )}

      {allowed.has("chemical_compliance") && (
        <section className="card">
          <div className="card-head">
            <h2>Chemie und Stoffe</h2>
            <label className="check"><input type="checkbox" checked={includeChemistry} onChange={(e) => setIncludeChemistry(e.target.checked)} /> mitsenden</label>
          </div>
          {includeChemistry && (
            <div className="stack">
              <label className="check"><input type="checkbox" checked={pfasFree} onChange={(e) => setPfasFree(e.target.checked)} /> Keine absichtlich zugesetzten PFAS (PFAS-frei)</label>
              <label className="field"><span>PFAS-Erklärung (https-URL)</span><input type="url" value={pfasUrl} onChange={(e) => setPfasUrl(e.target.value)} placeholder="https://…/pfas.pdf" /></label>
              <label className="check"><input type="checkbox" checked={svhcAbove} onChange={(e) => setSvhcAbove(e.target.checked)} /> Mindestens ein SVHC über 0,1 % w/w enthalten (REACH Art. 33)</label>
              <label className="field"><span>REACH-Erklärung (https-URL)</span><input type="url" value={reachUrl} onChange={(e) => setReachUrl(e.target.value)} /></label>
              <h3>Besorgniserregende Stoffe</h3>
              {substances.map((row) => (
                <div className="fiber-row" key={row.id}>
                  <label className="field"><span>Stoff</span><input value={row.name} onChange={(e) => updateSubstance(row.id, { name: e.target.value })} required /></label>
                  <label className="field"><span>CAS-Nummer</span><input value={row.cas} placeholder="335-67-1" onChange={(e) => updateSubstance(row.id, { cas: e.target.value })} /></label>
                  <label className="field"><span>Konzentration %</span><input type="number" min="0" max="100" step="0.01" value={row.concentration} onChange={(e) => updateSubstance(row.id, { concentration: e.target.value })} required /></label>
                  <label className="field"><span>Ort im Artikel</span><input value={row.location} placeholder="z. B. DWR-Ausrüstung" onChange={(e) => updateSubstance(row.id, { location: e.target.value })} /></label>
                  <button type="button" className="btn small remove" onClick={() => setSubstances((rows) => rows.filter((r) => r.id !== row.id))}>Entfernen</button>
                </div>
              ))}
              <div><button type="button" className="btn small" onClick={() => setSubstances((rows) => [...rows, { id: nextId(), name: "", cas: "", concentration: "", location: "" }])}>Stoff hinzufügen</button></div>
            </div>
          )}
        </section>
      )}

      {allowed.has("certificates") && (
        <section className="card">
          <div className="card-head">
            <h2>Zertifikate und Nachweise</h2>
            <button type="button" className="btn small" onClick={addCert}>Hinzufügen</button>
          </div>
          {certRows.length === 0 && <p className="muted small">Noch kein Zertifikat erfasst. GOTS, GRS, OEKO-TEX oder Prüfberichte stärken den Pass.</p>}
          <div className="stack">
            {certRows.map((row) => (
              <div className="fiber-row" key={row.id}>
                <label className="field"><span>Typ</span>
                  <select value={row.type} onChange={(e) => updateCert(row.id, { type: e.target.value as CertificateType })}>
                    {(Object.keys(CERTIFICATE_LABELS) as CertificateType[]).map((type) => <option key={type} value={type}>{CERTIFICATE_LABELS[type]}</option>)}
                  </select>
                </label>
                <label className="field"><span>Aussteller</span><input value={row.issuer} onChange={(e) => updateCert(row.id, { issuer: e.target.value })} required /></label>
                <label className="field"><span>Nummer</span><input value={row.number} onChange={(e) => updateCert(row.id, { number: e.target.value })} /></label>
                <label className="field"><span>Link (https)</span><input type="url" value={row.url} onChange={(e) => updateCert(row.id, { url: e.target.value })} /></label>
                <label className="field"><span>Gültig von</span><input type="date" value={row.validFrom} onChange={(e) => updateCert(row.id, { validFrom: e.target.value })} /></label>
                <label className="field"><span>Gültig bis</span><input type="date" value={row.validUntil} onChange={(e) => updateCert(row.id, { validUntil: e.target.value })} /></label>
                <button type="button" className="btn small remove" onClick={() => setCertRows((rows) => rows.filter((r) => r.id !== row.id))}>Entfernen</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {allowed.has("environmental_footprint") && (
        <section className="card">
          <div className="card-head">
            <h2>Umweltfußabdruck</h2>
            <label className="check"><input type="checkbox" checked={includeFootprint} onChange={(e) => setIncludeFootprint(e.target.checked)} /> mitsenden</label>
          </div>
          {includeFootprint && (
            <div className="form-grid">
              <label className="field"><span>kg CO₂e pro Stück</span><input type="number" min="0" step="0.01" value={pcf} onChange={(e) => setPcf(e.target.value)} required /></label>
              <label className="field"><span>Methode</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  <option value="pef">EU PEF</option><option value="iso_14067">ISO 14067</option><option value="ghg_protocol_product">GHG Protocol</option><option value="other">Andere</option>
                </select>
              </label>
              <label className="field"><span>Systemgrenze</span>
                <select value={boundary} onChange={(e) => setBoundary(e.target.value as typeof boundary)}>
                  <option value="cradle_to_gate">Cradle-to-Gate</option><option value="cradle_to_grave">Cradle-to-Grave</option>
                </select>
              </label>
              <label className="field"><span>Bezugsjahr</span><input type="number" min="2015" max="2100" value={year} onChange={(e) => setYear(e.target.value)} required /></label>
              <label className="field"><span>Wasser (Liter)</span><input type="number" min="0" value={water} onChange={(e) => setWater(e.target.value)} /></label>
            </div>
          )}
        </section>
      )}

      {allowed.has("supplier_details") && (
        <section className="card">
          <div className="card-head">
            <h2>Betriebsdaten</h2>
            <label className="check"><input type="checkbox" checked={includeDetails} onChange={(e) => setIncludeDetails(e.target.checked)} /> mitsenden</label>
          </div>
          {includeDetails && (
            <div className="form-grid">
              <label className="field"><span>Standort-GLN (13 Ziffern)</span><input value={facilityGln} inputMode="numeric" onChange={(e) => setFacilityGln(e.target.value)} /></label>
              <label className="field"><span>Kontakt-E-Mail</span><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></label>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <label className="field"><span>Anmerkung für das Label (optional)</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {error && <ErrorBox error={error} />}
        <div className="row between" style={{ marginTop: 12 }}>
          <span className="small muted">Jede Übermittlung wird mit Zeitstempel und Prüfsumme protokolliert.</span>
          <button className="btn primary" type="submit" disabled={submitting || (includeFibers && !fiberTotalOk)}>
            {submitting ? "Wird gesendet …" : "An das Label übermitteln"}
          </button>
        </div>
      </section>
    </form>
  );
}

function ErrorBox({ error }: { error: ApiError | Error }) {
  if (error instanceof ApiError) {
    if (error.status === 422 && error.issues.length > 0) {
      return (
        <div className="alert danger" style={{ marginTop: 10 }}>
          Die Angaben entsprechen nicht dem Pass-Schema:
          <ul>{error.issues.map((issue, index) => <li key={index}><code>{issue.loc.filter((p) => p !== "body").join(".")}</code>: {issue.msg}</li>)}</ul>
        </div>
      );
    }
    if (error.status === 403) {
      return <div className="alert danger" style={{ marginTop: 10 }}>{String(error.detail)}</div>;
    }
  }
  return <div className="alert danger" style={{ marginTop: 10 }}>{error.message}</div>;
}
