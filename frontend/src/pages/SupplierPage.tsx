/** Supplier form: opened via token link, shows only what this supplier may and should fill in. */

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { usePageTitle } from "../lib/a11y";
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
const nextId = () => `row-${(counter += 1)}`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CHEMISTRY_CERT_TYPES: CertificateType[] = ["oeko_tex_standard_100", "oeko_tex_made_in_green", "bluesign", "zdhc_mrsl", "reach_declaration", "pfas_declaration", "test_report"];

type LoadState = { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; context: SupplierContext };

export function SupplierPage() {
  const { gtin = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  usePageTitle("Lieferantenportal");

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
    <main id="main" tabIndex={-1} className="wrap">
      <p className="eyebrow">Lieferantenportal</p>
      {state.status === "loading" && <p role="status" className="muted" style={{ marginTop: "1rem" }}>Einladung wird geprüft …</p>}
      {state.status === "error" && (
        <section role="alert" aria-labelledby="err-title" style={{ marginTop: "1rem" }}>
          <h1 id="err-title" className="display">Einladung ungültig</h1>
          <p className="lede">
            {state.error instanceof ApiError && state.error.status === 401
              ? "Das Token ist unbekannt, abgelaufen oder zurückgezogen. Bitte beim Label einen neuen Link anfordern."
              : state.error.message}
          </p>
        </section>
      )}
      {state.status === "ready" && <SupplierForm gtin={gtin} token={token} context={state.context} />}
    </main>
  );
}

/** Map a backend validation location (e.g. body.fiber_compositions.0.fibers.1.percentage) to a field id. */
function fieldIdFor(loc: (string | number)[]): string | null {
  const parts = loc.filter((p) => p !== "body").map(String);
  while (parts.length > 0) {
    const id = parts.join("-");
    if (document.getElementById(id)) return id;
    parts.pop();
  }
  return null;
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
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const errorRef = useRef<HTMLDivElement>(null);

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
    setInvalidIds(new Set());
    try {
      setResult(await supplierUpdate(gtin, token, buildPayload()));
    } catch (caught) {
      const failure = caught instanceof Error ? caught : new Error(String(caught));
      setError(failure);
      if (failure instanceof ApiError) {
        const ids = failure.issues.map((issue) => fieldIdFor(issue.loc)).filter((id): id is string => id !== null);
        setInvalidIds(new Set(ids));
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <section role="status" aria-labelledby="done-title" style={{ marginTop: "1rem" }}>
        <h1 id="done-title" className="display">Daten übermittelt</h1>
        <p className="lede">
          Vielen Dank, {context.supplier.name}. Ihre Angaben sind im Pass angekommen und als Version {result.passport_version} gespeichert.
        </p>
        <dl className="facts">
          <dt>Status des Passes</dt><dd>{STATUS_LABELS[result.status]}</dd>
          <dt>Abschnitte</dt><dd>{result.sections_updated.map((s) => SECTION_LABELS[s]).join(", ")}</dd>
          <dt>Prüfsumme</dt><dd><code>{result.contribution.payload_sha256.slice(0, 16)}…</code> (SHA-256 der Übermittlung)</dd>
        </dl>
        <p className="muted" style={{ marginTop: "1rem" }}>
          {result.missing_after_update.length > 0
            ? `Dem Pass fehlen noch: ${result.missing_after_update.map((m) => missingLabel(m)).join(", ")}. Dafür sind andere Beteiligte zuständig.`
            : "Der Pass ist vollständig und kann vom Label veröffentlicht werden."}
        </p>
      </section>
    );
  }

  const invalid = (id: string) => (invalidIds.has(id) ? true : undefined);

  return (
    <form className="stack-lg" onSubmit={onSubmit} noValidate={false} aria-describedby="form-intro">
      <header>
        <h1 className="display">{context.supplier.name}</h1>
        <p className="lede" id="form-intro">
          {ROLE_LABELS[context.supplier.role]} für <strong>{context.product_name}</strong>, GTIN <code>{context.gtin}</code>
          {context.batch ? <>, Charge <code>{context.batch}</code></> : null}. Der Link ist bis {formatDate(context.expires_at)} gültig.
        </p>
        <div className={`notice ${context.missing_for_me.length > 0 ? "notice-warn" : "notice-ok"}`} style={{ marginTop: "1.25rem" }}>
          {context.missing_for_me.length > 0 ? (
            <>
              <strong>Vom Label angefragt</strong>
              <ul>
                {context.missing_for_me.map((m) => (
                  <li key={m.path}>{missingLabel(m)} <span className="small muted" lang="en">({m.source})</span></li>
                ))}
              </ul>
            </>
          ) : (
            <>Für Ihre Rolle fehlen keine Pflichtangaben mehr. Sie können Angaben trotzdem aktualisieren.</>
          )}
        </div>
      </header>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-danger" id="form-errors">
          <ErrorSummary error={error} />
        </div>
      )}

      {allowed.has("fiber_compositions") && (
        <fieldset className="section" id="fiber_compositions-0">
          <legend className="section-title">
            <span className="num" aria-hidden="true">01</span>
            <h2>Faserzusammensetzung</h2>
          </legend>
          <label className="check">
            <input type="checkbox" checked={includeFibers} onChange={(e) => setIncludeFibers(e.target.checked)} />
            Abschnitt Faserzusammensetzung mitsenden
          </label>
          {includeFibers && (
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <div className="field">
                <label htmlFor="component">Bauteil</label>
                <select id="component" value={component} onChange={(e) => setComponent(e.target.value)}>
                  <option value="main_fabric">Oberstoff</option><option value="lining">Futter</option><option value="rib_collar">Bündchen</option><option value="trim">Zutaten</option>
                </select>
              </div>
              {fiberRows.map((row, index) => {
                const base = `fiber_compositions-0-fibers-${index}`;
                return (
                  <fieldset className="subform" key={row.id} id={base}>
                    <legend>Faser {index + 1}</legend>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor={`${base}-fiber`}>Faser</label>
                        <select id={`${base}-fiber`} value={row.fiber} onChange={(e) => updateFiber(row.id, { fiber: e.target.value as FiberType })}>
                          {(Object.keys(FIBER_LABELS) as FiberType[]).map((fiber) => <option key={fiber} value={fiber}>{FIBER_LABELS[fiber]}</option>)}
                        </select>
                      </div>
                      {row.fiber === "other" && (
                        <div className="field">
                          <label htmlFor={`${base}-fiber_name_other`}>Bezeichnung (Pflicht)</label>
                          <input id={`${base}-fiber_name_other`} value={row.otherName} onChange={(e) => updateFiber(row.id, { otherName: e.target.value })} required aria-invalid={invalid(`${base}-fiber_name_other`)} />
                        </div>
                      )}
                      <div className="field">
                        <label htmlFor={`${base}-percentage`}>Anteil in Prozent (Pflicht)</label>
                        <input id={`${base}-percentage`} type="number" inputMode="decimal" min="0.1" max="100" step="0.1" value={row.percentage} onChange={(e) => updateFiber(row.id, { percentage: e.target.value })} required aria-invalid={invalid(`${base}-percentage`)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`${base}-recycled_percentage`}>Davon recycelt in Prozent</label>
                        <input id={`${base}-recycled_percentage`} type="number" inputMode="numeric" min="0" max="100" step="1" value={row.recycled} onChange={(e) => updateFiber(row.id, { recycled: e.target.value })} aria-invalid={invalid(`${base}-recycled_percentage`)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`${base}-recycled_source`}>Quelle des Rezyklats</label>
                        <select id={`${base}-recycled_source`} value={row.source} onChange={(e) => updateFiber(row.id, { source: e.target.value as RecycledSource | "" })}>
                          <option value="">keine Angabe</option>
                          {(Object.keys(RECYCLED_SOURCE_LABELS) as RecycledSource[]).map((source) => <option key={source} value={source}>{RECYCLED_SOURCE_LABELS[source]}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`${base}-origin_country`}>Herkunftsland</label>
                        <input id={`${base}-origin_country`} value={row.origin} maxLength={2} autoCapitalize="characters" aria-describedby={`${base}-origin-hint`} onChange={(e) => updateFiber(row.id, { origin: e.target.value })} aria-invalid={invalid(`${base}-origin_country`)} />
                        <span className="field-hint" id={`${base}-origin-hint`}>Zwei Buchstaben nach ISO 3166, zum Beispiel TR</span>
                      </div>
                      {certRows.length > 0 && (
                        <div className="field">
                          <label htmlFor={`${base}-certificate_ids`}>Zugehöriges Zertifikat</label>
                          <select id={`${base}-certificate_ids`} value={row.certificateId} onChange={(e) => updateFiber(row.id, { certificateId: e.target.value })}>
                            <option value="">keines</option>
                            {certRows.map((cert) => <option key={cert.id} value={cert.certificateId}>{CERTIFICATE_LABELS[cert.type]}{cert.number ? ` ${cert.number}` : ""}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    {fiberRows.length > 1 && (
                      <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setFiberRows((rows) => rows.filter((r) => r.id !== row.id))}>Faser {index + 1} entfernen</button></div>
                    )}
                  </fieldset>
                );
              })}
              <div className="sum-line">
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setFiberRows((rows) => [...rows, { id: nextId(), fiber: "elastane", otherName: "", percentage: "", recycled: "0", source: "", origin: "", certificateId: "" }])}>Weitere Faser hinzufügen</button>
                <span className={`status ${fiberTotalOk ? "status-ok" : "status-danger"}`} role="status">Summe {fiberTotal.toFixed(1)} %{fiberTotalOk ? "" : ", muss 100 % ergeben"}</span>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {allowed.has("chemical_compliance") && (
        <fieldset className="section" id="chemical_compliance">
          <legend className="section-title">
            <span className="num" aria-hidden="true">02</span>
            <h2>Chemie und Stoffe</h2>
          </legend>
          <label className="check">
            <input type="checkbox" checked={includeChemistry} onChange={(e) => setIncludeChemistry(e.target.checked)} />
            Abschnitt Chemie und Stoffe mitsenden
          </label>
          {includeChemistry && (
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <label className="check"><input type="checkbox" checked={pfasFree} onChange={(e) => setPfasFree(e.target.checked)} /> Keine absichtlich zugesetzten PFAS (PFAS-frei)</label>
              <div className="field">
                <label htmlFor="chemical_compliance-pfas_declaration_url">PFAS-Erklärung als Link</label>
                <input id="chemical_compliance-pfas_declaration_url" type="url" value={pfasUrl} onChange={(e) => setPfasUrl(e.target.value)} aria-describedby="pfas-hint" aria-invalid={invalid("chemical_compliance-pfas_declaration_url")} />
                <span className="field-hint" id="pfas-hint">Nur https-Adressen, zum Beispiel https://ihr-betrieb.de/pfas.pdf</span>
              </div>
              <label className="check"><input type="checkbox" checked={svhcAbove} onChange={(e) => setSvhcAbove(e.target.checked)} /> Mindestens ein SVHC über 0,1 % enthalten (REACH Art. 33)</label>
              <div className="field">
                <label htmlFor="chemical_compliance-reach_declaration_url">REACH-Erklärung als Link</label>
                <input id="chemical_compliance-reach_declaration_url" type="url" value={reachUrl} onChange={(e) => setReachUrl(e.target.value)} aria-invalid={invalid("chemical_compliance-reach_declaration_url")} />
              </div>
              <h3 style={{ marginTop: "0.5rem" }}>Besorgniserregende Stoffe</h3>
              {substances.length === 0 && <p className="muted small">Keine Stoffe erfasst. Erfassen Sie jeden Stoff der REACH-Kandidatenliste, der im Artikel enthalten ist.</p>}
              {substances.map((row, index) => {
                const base = `chemical_compliance-substances_of_concern-${index}`;
                return (
                  <fieldset className="subform" key={row.id} id={base}>
                    <legend>Stoff {index + 1}</legend>
                    <div className="form-grid">
                      <div className="field"><label htmlFor={`${base}-name`}>Stoffname (Pflicht)</label><input id={`${base}-name`} value={row.name} onChange={(e) => updateSubstance(row.id, { name: e.target.value })} required aria-invalid={invalid(`${base}-name`)} /></div>
                      <div className="field"><label htmlFor={`${base}-cas_number`}>CAS-Nummer</label><input id={`${base}-cas_number`} value={row.cas} inputMode="numeric" aria-describedby={`${base}-cas-hint`} onChange={(e) => updateSubstance(row.id, { cas: e.target.value })} aria-invalid={invalid(`${base}-cas_number`)} /><span className="field-hint" id={`${base}-cas-hint`}>Format 335-67-1</span></div>
                      <div className="field"><label htmlFor={`${base}-concentration_percent`}>Konzentration in Prozent (Pflicht)</label><input id={`${base}-concentration_percent`} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={row.concentration} onChange={(e) => updateSubstance(row.id, { concentration: e.target.value })} required aria-invalid={invalid(`${base}-concentration_percent`)} /></div>
                      <div className="field"><label htmlFor={`${base}-location`}>Ort im Artikel</label><input id={`${base}-location`} value={row.location} placeholder="z. B. DWR-Ausrüstung" onChange={(e) => updateSubstance(row.id, { location: e.target.value })} /></div>
                    </div>
                    <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setSubstances((rows) => rows.filter((r) => r.id !== row.id))}>Stoff {index + 1} entfernen</button></div>
                  </fieldset>
                );
              })}
              <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setSubstances((rows) => [...rows, { id: nextId(), name: "", cas: "", concentration: "", location: "" }])}>Stoff hinzufügen</button></div>
            </div>
          )}
        </fieldset>
      )}

      {allowed.has("certificates") && (
        <fieldset className="section" id="certificates">
          <legend className="section-title">
            <span className="num" aria-hidden="true">{allowed.has("chemical_compliance") ? "03" : "02"}</span>
            <h2>Zertifikate und Nachweise</h2>
          </legend>
            <div className="section-actions"><button type="button" className="btn btn-quiet btn-small" onClick={addCert}>Zertifikat hinzufügen</button></div>

          {certRows.length === 0 && <p className="muted small">Noch kein Zertifikat erfasst. GOTS, GRS, OEKO-TEX oder Prüfberichte stärken den Pass.</p>}
          <div className="stack">
            {certRows.map((row, index) => {
              const base = `certificates-${index}`;
              return (
                <fieldset className="subform" key={row.id} id={base}>
                  <legend>Zertifikat {index + 1}</legend>
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`${base}-type`}>Typ</label>
                      <select id={`${base}-type`} value={row.type} onChange={(e) => updateCert(row.id, { type: e.target.value as CertificateType })}>
                        {(Object.keys(CERTIFICATE_LABELS) as CertificateType[]).map((type) => <option key={type} value={type}>{CERTIFICATE_LABELS[type]}</option>)}
                      </select>
                    </div>
                    <div className="field"><label htmlFor={`${base}-issuer`}>Aussteller (Pflicht)</label><input id={`${base}-issuer`} value={row.issuer} onChange={(e) => updateCert(row.id, { issuer: e.target.value })} required aria-invalid={invalid(`${base}-issuer`)} /></div>
                    <div className="field"><label htmlFor={`${base}-number`}>Nummer</label><input id={`${base}-number`} value={row.number} onChange={(e) => updateCert(row.id, { number: e.target.value })} /></div>
                    <div className="field"><label htmlFor={`${base}-url`}>Link zum Nachweis</label><input id={`${base}-url`} type="url" value={row.url} onChange={(e) => updateCert(row.id, { url: e.target.value })} aria-invalid={invalid(`${base}-url`)} /></div>
                    <div className="field"><label htmlFor={`${base}-valid_from`}>Gültig von</label><input id={`${base}-valid_from`} type="date" value={row.validFrom} onChange={(e) => updateCert(row.id, { validFrom: e.target.value })} /></div>
                    <div className="field"><label htmlFor={`${base}-valid_until`}>Gültig bis</label><input id={`${base}-valid_until`} type="date" value={row.validUntil} onChange={(e) => updateCert(row.id, { validUntil: e.target.value })} aria-invalid={invalid(`${base}-valid_until`)} /></div>
                  </div>
                  <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setCertRows((rows) => rows.filter((r) => r.id !== row.id))}>Zertifikat {index + 1} entfernen</button></div>
                </fieldset>
              );
            })}
          </div>
        </fieldset>
      )}

      {allowed.has("environmental_footprint") && (
        <fieldset className="section" id="environmental_footprint">
          <legend className="section-title">
            <span className="num" aria-hidden="true">03</span>
            <h2>Umweltfußabdruck</h2>
          </legend>
          <label className="check">
            <input type="checkbox" checked={includeFootprint} onChange={(e) => setIncludeFootprint(e.target.checked)} />
            Abschnitt Umweltfußabdruck mitsenden
          </label>
          {includeFootprint && (
            <div className="form-grid" style={{ marginTop: "0.75rem" }}>
              <div className="field"><label htmlFor="environmental_footprint-pcf_kg_co2e">kg CO₂-Äquivalent pro Stück (Pflicht)</label><input id="environmental_footprint-pcf_kg_co2e" type="number" inputMode="decimal" min="0" step="0.01" value={pcf} onChange={(e) => setPcf(e.target.value)} required aria-invalid={invalid("environmental_footprint-pcf_kg_co2e")} /></div>
              <div className="field"><label htmlFor="environmental_footprint-method">Methode</label>
                <select id="environmental_footprint-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  <option value="pef">EU PEF</option><option value="iso_14067">ISO 14067</option><option value="ghg_protocol_product">GHG Protocol</option><option value="other">Andere</option>
                </select>
              </div>
              <div className="field"><label htmlFor="environmental_footprint-boundary">Systemgrenze</label>
                <select id="environmental_footprint-boundary" value={boundary} onChange={(e) => setBoundary(e.target.value as typeof boundary)}>
                  <option value="cradle_to_gate">Cradle-to-Gate</option><option value="cradle_to_grave">Cradle-to-Grave</option>
                </select>
              </div>
              <div className="field"><label htmlFor="environmental_footprint-reference_year">Bezugsjahr</label><input id="environmental_footprint-reference_year" type="number" inputMode="numeric" min="2015" max="2100" value={year} onChange={(e) => setYear(e.target.value)} required aria-invalid={invalid("environmental_footprint-reference_year")} /></div>
              <div className="field"><label htmlFor="environmental_footprint-water_consumption_l">Wasserverbrauch in Litern</label><input id="environmental_footprint-water_consumption_l" type="number" inputMode="numeric" min="0" value={water} onChange={(e) => setWater(e.target.value)} /></div>
            </div>
          )}
        </fieldset>
      )}

      {allowed.has("supplier_details") && (
        <fieldset className="section" id="supplier_details">
          <legend className="section-title">
            <span className="num" aria-hidden="true">{allowed.has("environmental_footprint") ? "04" : allowed.has("chemical_compliance") ? "04" : "03"}</span>
            <h2>Betriebsdaten</h2>
          </legend>
          <label className="check">
            <input type="checkbox" checked={includeDetails} onChange={(e) => setIncludeDetails(e.target.checked)} />
            Abschnitt Betriebsdaten mitsenden
          </label>
          {includeDetails && (
            <div className="form-grid" style={{ marginTop: "0.75rem" }}>
              <div className="field"><label htmlFor="supplier_details-facility_gln">Standort-GLN</label><input id="supplier_details-facility_gln" value={facilityGln} inputMode="numeric" aria-describedby="gln-hint" onChange={(e) => setFacilityGln(e.target.value)} aria-invalid={invalid("supplier_details-facility_gln")} /><span className="field-hint" id="gln-hint">13 Ziffern, von GS1 vergeben</span></div>
              <div className="field"><label htmlFor="supplier_details-contact_email">Kontakt-E-Mail</label><input id="supplier_details-contact_email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} aria-invalid={invalid("supplier_details-contact_email")} /></div>
            </div>
          )}
        </fieldset>
      )}

      <div className="section">
        <div className="field">
          <label htmlFor="note">Anmerkung für das Label (optional)</label>
          <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="btn-row" style={{ marginTop: "1.25rem", justifyContent: "space-between" }}>
          <span className="small muted">Jede Übermittlung wird mit Zeitstempel und Prüfsumme protokolliert.</span>
          <button className="btn btn-primary btn-arrow" type="submit" disabled={submitting || (includeFibers && !fiberTotalOk)} aria-busy={submitting}>
            {submitting ? "Wird gesendet" : "An das Label übermitteln"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ErrorSummary({ error }: { error: ApiError | Error }) {
  if (error instanceof ApiError) {
    if (error.status === 422 && error.issues.length > 0) {
      return (
        <>
          <strong>Die Übermittlung wurde abgelehnt. Bitte die folgenden Angaben prüfen:</strong>
          <ul>
            {error.issues.map((issue, index) => {
              const id = fieldIdFor(issue.loc);
              const path = issue.loc.filter((p) => p !== "body").join(" › ");
              return (
                <li key={index}>
                  {id ? <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.focus(); }}>{path}</a> : path}: {issue.msg}
                </li>
              );
            })}
          </ul>
        </>
      );
    }
    if (error.status === 403) {
      return <><strong>Nicht erlaubt</strong>{String(error.detail)}</>;
    }
  }
  return <><strong>Übermittlung fehlgeschlagen</strong>{error.message}</>;
}
