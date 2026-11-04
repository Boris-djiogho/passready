/** Brand dashboard: passports with completeness, supplier invitations, chemistry check, publish. */

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  ApiError,
  type BrandApi,
  type ChemistryScreeningResult,
  type CompletenessReport,
  type DigitalProductPassport,
  type MissingField,
  type PassportSummary,
  type ScanSummary,
  type SupplierInviteResponse,
  type SupplierRole,
  brandApi,
  digitalLinkPath,
} from "../api/client";
import { countryName, usePageTitle } from "../lib/a11y";
import { ROLE_LABELS, STATUS_LABELS, formatDate, missingLabel, responsibleLabel } from "../lib/labels";

const STORAGE_KEY = "passready.brandApiKey";

function readStoredKey(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function BrandPage() {
  usePageTitle("Label-Dashboard");
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [passports, setPassports] = useState<PassportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PassportSummary | null>(null);

  const api = apiKey ? brandApi(apiKey) : null;

  const load = useCallback(async () => {
    if (!api) return;
    setError(null);
    try {
      const list = await api.list();
      setPassports(list);
      setSelected((current) => (current ? list.find((p) => p.dpp_id === current.dpp_id) ?? list[0] ?? null : list[0] ?? null));
    } catch (caught) {
      setPassports(null);
      setError(caught instanceof ApiError && caught.status === 401 ? "Der API-Key wird nicht akzeptiert." : String(caught));
    }
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const applyKey = (key: string) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      // storage unavailable; key stays in memory
    }
    setDraftKey(key);
    setApiKey(key);
  };

  const saveKey = (event: FormEvent) => {
    event.preventDefault();
    applyKey(draftKey);
  };

  return (
    <main id="main" tabIndex={-1} className="wrap wide">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Label-Dashboard</p>
          <h1 className="display">Produktpässe</h1>
        </div>
        <form className="key-form" onSubmit={saveKey} aria-label="Anmeldung mit API-Key">
          <div className="field">
            <label htmlFor="api-key" className="small">API-Key des Labels</label>
            <input id="api-key" type="password" autoComplete="off" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
          </div>
          <button className="btn" type="submit">Anmelden</button>
          <button className="btn btn-quiet" type="button" onClick={() => applyKey("demo-brand-key")}>Demo-Key verwenden</button>
        </form>
      </div>

      {!api && <p className="empty">Bitte mit dem API-Key des Labels anmelden.</p>}
      {error && <p role="alert" className="notice notice-danger">{error}</p>}

      {api && passports && (
        <div className="cols">
          <aside aria-labelledby="h-articles">
            <h2 id="h-articles" className="eyebrow" style={{ marginBottom: "0.5rem" }}>Artikel</h2>
            <ul className="link-list">
              {passports.map((passport) => (
                <li key={passport.dpp_id}>
                  <button type="button" aria-current={selected?.dpp_id === passport.dpp_id ? "true" : undefined} onClick={() => setSelected(passport)}>
                    <span>
                      <span className="link-title">{passport.product_name}</span>
                      <span className="link-meta">
                        {passport.batch ? `Charge ${passport.batch}` : "Modellebene"} · {STATUS_LABELS[passport.status]}
                      </span>
                    </span>
                    <span className="arrow" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          {selected && <PassportDetail key={selected.dpp_id} api={api} summary={selected} onChanged={load} />}
        </div>
      )}
    </main>
  );
}

function StatusText({ status }: { status: PassportSummary["status"] }) {
  const tone = status === "published" ? "status-ok" : status === "withdrawn" ? "status-danger" : status === "in_review" ? "status-neutral" : "status-warn";
  return <span className={`status ${tone}`}>{STATUS_LABELS[status]}</span>;
}

function Section({ num, title, id, actions, children }: { num: string; title: string; id: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section" aria-labelledby={`h-${id}`}>
      <div className="section-title">
        <span className="num" aria-hidden="true">{num}</span>
        <h2 id={`h-${id}`}>{title}</h2>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function PassportDetail({ api, summary, onChanged }: { api: BrandApi; summary: PassportSummary; onChanged: () => Promise<void> }) {
  const { gtin, batch, serial } = summary;
  const [passport, setPassport] = useState<DigitalProductPassport | null>(null);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [scans, setScans] = useState<ScanSummary | null>(null);
  const [chemistry, setChemistry] = useState<ChemistryScreeningResult | null>(null);
  const [chemistryError, setChemistryError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; missing: MissingField[] } | null>(null);
  const [publishedNow, setPublishedNow] = useState(false);
  const [invite, setInvite] = useState<SupplierInviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [p, r, s] = await Promise.all([api.get(gtin, batch, serial), api.completeness(gtin, batch, serial), api.scans(gtin)]);
    setPassport(p);
    setReport(r);
    setScans(s);
  }, [api, gtin, batch, serial]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runChemistry = async () => {
    setChemistryError(null);
    try {
      setChemistry(await api.chemistryCheck(gtin, batch, serial));
    } catch (caught) {
      setChemistry(null);
      setChemistryError(caught instanceof ApiError ? String(caught.detail) : String(caught));
    }
  };

  const publish = async () => {
    setBusy(true);
    setPublishError(null);
    try {
      await api.publish(gtin, batch, serial);
      setPublishedNow(true);
      await refresh();
      await onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) setPublishError({ message: String(caught.detail), missing: caught.missing });
      else setPublishError({ message: String(caught), missing: [] });
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setInviteError(null);
    setCopied(false);
    setBusy(true);
    try {
      const response = await api.invite(gtin, {
        supplier: {
          name: String(data.get("name") ?? ""),
          role: String(data.get("role")) as SupplierRole,
          tier: Number(data.get("tier") ?? 1),
          country: String(data.get("country") ?? "").toUpperCase(),
          data_status: "pending",
        },
        batch,
        serial,
      });
      setInvite(response);
      form.reset();
      await refresh();
    } catch (caught) {
      setInviteError(caught instanceof ApiError ? (typeof caught.detail === "string" ? caught.detail : "Die Angaben zum Lieferanten sind unvollständig.") : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!passport || !report) return <p role="status" className="empty">Pass wird geladen …</p>;

  const suppliers = passport.suppliers ?? [];
  const contributions = passport.contributions ?? [];
  const supplierLink = invite ? `${window.location.origin}/supplier/${gtin}?token=${invite.token}` : null;

  return (
    <article aria-labelledby="detail-title">
      <header className="detail-head">
        <h2 id="detail-title" className="display" style={{ fontSize: "1.75rem" }}>{passport.product.name}</h2>
        <p className="muted">
          GTIN <code>{gtin}</code>{batch ? <>, Charge <code>{batch}</code></> : null}{serial ? <>, Seriennummer <code>{serial}</code></> : null} · Version {passport.version}
          {passport.published_at ? ` · veröffentlicht am ${formatDate(passport.published_at)}` : ""}
        </p>
        <div className="row">
          <StatusText status={passport.status} />
          <Link className="btn btn-quiet btn-small" to={digitalLinkPath(gtin, batch, serial)}>Pass ansehen</Link>
        </div>
        {scans && (
          <p className="small muted">
            {scans.total} Aufrufe über den QR-Code, davon {scans.billable} abrechenbar. Aufrufe von Behörden und Recyclern sind immer frei.
          </p>
        )}
      </header>

      <Section num="01" title="Vollständigkeit" id="completeness">
        <p>
          <span className={`status ${report.complete ? "status-ok" : "status-warn"}`}>
            {report.complete ? "Alle Pflichtangaben liegen vor" : `${report.missing.length} Pflichtangabe${report.missing.length === 1 ? "" : "n"} offen`}
          </span>
        </p>
        <div className="meter" role="progressbar" aria-label="Erfüllte Pflichtangaben" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.score} aria-valuetext={`${report.score} Prozent`} style={{ margin: "0.75rem 0" }}>
          <span style={{ width: `${report.score}%` }} />
        </div>
        {report.missing.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption>Offene Pflichtangaben, wer sie liefert und worauf sie beruhen</caption>
              <thead><tr><th scope="col">Angabe</th><th scope="col">Zuständig</th><th scope="col">Grundlage</th></tr></thead>
              <tbody>
                {report.missing.map((field) => (
                  <tr key={field.path}>
                    <td>{missingLabel(field)}</td>
                    <td>{responsibleLabel(field.responsible)}</td>
                    <td className="small muted" lang="en">{field.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.recommended_missing.length > 0 && (
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            Empfohlen, noch offen: {report.recommended_missing.map((f) => missingLabel(f)).join(", ")}
          </p>
        )}
      </Section>

      <Section num="02" title="Lieferanten" id="suppliers">
        {suppliers.length === 0 ? (
          <p className="muted">Noch keine Lieferanten hinterlegt.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>Beteiligte Betriebe und Stand ihrer Daten</caption>
              <thead><tr><th scope="col">Betrieb</th><th scope="col">Rolle</th><th scope="col">Tier</th><th scope="col">Land</th><th scope="col">Daten</th></tr></thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.supplier_id}>
                    <td>{supplier.name}</td>
                    <td>{ROLE_LABELS[supplier.role]}</td>
                    <td>{supplier.tier}</td>
                    <td>{countryName(supplier.country)}</td>
                    <td>
                      <span className={`status ${supplier.data_status === "pending" ? "status-warn" : "status-ok"}`}>
                        {supplier.data_status === "pending" ? "ausstehend" : supplier.data_status === "submitted" ? "geliefert" : "geprüft"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={onInvite} style={{ marginTop: "1.25rem" }}>
          <fieldset>
            <legend><h3>Lieferant einladen</h3></legend>
            <p className="small muted" style={{ margin: "0.25rem 0 0.75rem" }}>Der Betrieb erhält einen Link und füllt nur die Felder seiner Rolle aus. Ein Konto braucht er nicht.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="inv-name">Name des Betriebs</label><input id="inv-name" name="name" required autoComplete="organization" /></div>
              <div className="field"><label htmlFor="inv-role">Rolle</label>
                <select id="inv-role" name="role" defaultValue="weaving">
                  {(Object.keys(ROLE_LABELS) as SupplierRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="inv-tier">Tier</label><input id="inv-tier" name="tier" type="number" inputMode="numeric" min={1} max={4} defaultValue={2} aria-describedby="tier-hint" /><span className="field-hint" id="tier-hint">1 = direkter Lieferant</span></div>
              <div className="field"><label htmlFor="inv-country">Land</label><input id="inv-country" name="country" maxLength={2} required autoCapitalize="characters" aria-describedby="country-hint" /><span className="field-hint" id="country-hint">Zwei Buchstaben, zum Beispiel PT</span></div>
            </div>
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <button className="btn" type="submit" disabled={busy}>Einladungslink erzeugen</button>
            </div>
          </fieldset>
          {inviteError && <p role="alert" className="notice notice-danger" style={{ marginTop: "0.75rem" }}>{inviteError}</p>}
          {invite && supplierLink && (
            <div role="status" className="notice notice-ok" style={{ marginTop: "0.75rem" }}>
              <strong>Link für {ROLE_LABELS[invite.supplier_role]}, gültig bis {formatDate(invite.expires_at)}</strong>
              <code>{supplierLink}</code>
              <div className="btn-row" style={{ marginTop: "0.75rem" }}>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => void copyLink(supplierLink)}>{copied ? "Link kopiert" : "Link kopieren"}</button>
                <Link className="btn btn-quiet btn-small" to={`/supplier/${gtin}?token=${invite.token}`}>Formular öffnen</Link>
              </div>
            </div>
          )}
        </form>
      </Section>

      <Section
        num="03"
        title="Chemie-Check"
        id="chemistry"
        actions={<button className="btn btn-quiet btn-small" type="button" onClick={() => void runChemistry()}>Jetzt prüfen</button>}
      >
        <p className="small muted">Abgleich der gemeldeten Stoffe mit der REACH-Kandidatenliste und der PFAS-Beschränkung.</p>
        {chemistryError && <p role="status" className="notice notice-warn" style={{ marginTop: "0.75rem" }}>{chemistryError}</p>}
        {chemistry && (
          <div role="status" className="stack" style={{ marginTop: "0.75rem" }}>
            <ul className="status-list">
              <li>
                <span className={`status ${chemistry.risk_level === "high" ? "status-danger" : chemistry.risk_level === "review" ? "status-warn" : "status-ok"}`}>
                  Risiko {chemistry.risk_level === "high" ? "hoch" : chemistry.risk_level === "review" ? "zu prüfen" : "keins"}
                </span>
              </li>
              <li>
                <span className={`status ${chemistry.pfas_claim_consistent ? "status-ok" : "status-danger"}`}>
                  PFAS-Angabe {chemistry.pfas_claim_consistent ? "konsistent" : "widersprüchlich"}
                </span>
              </li>
            </ul>
            {chemistry.findings.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <caption>Treffer in den Referenzlisten (Stand {chemistry.reference_list_version})</caption>
                  <thead><tr><th scope="col">Gemeldet</th><th scope="col">Treffer</th><th scope="col">Listen</th><th scope="col" className="num">Konz.</th></tr></thead>
                  <tbody>
                    {chemistry.findings.map((finding, index) => (
                      <tr key={index}>
                        <td>{finding.declared_name}{finding.cas_number ? <><br /><code className="small">{finding.cas_number}</code></> : null}</td>
                        <td>{finding.matched_name}</td>
                        <td>{finding.matched_lists.join(", ")}</td>
                        <td className="num">{finding.concentration_percent} %{finding.above_svhc_threshold ? ", über Schwelle" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {chemistry.notes.length > 0 && <ul style={{ paddingLeft: "1.2rem" }} className="small">{chemistry.notes.map((note) => <li key={note} lang="en">{note}</li>)}</ul>}
            {chemistry.findings.length === 0 && chemistry.notes.length === 0 && <p className="small muted">Keine Treffer in den Referenzlisten.</p>}
          </div>
        )}
      </Section>

      <Section num="04" title="Veröffentlichen" id="publish">
        <p className="small muted">Erst wenn alle Pflichtangaben vorliegen, wird der Pass über den QR-Code erreichbar.</p>
        <div className="btn-row" style={{ marginTop: "0.75rem" }}>
          <button className="btn btn-primary" type="button" onClick={() => void publish()} disabled={busy || passport.status === "published" || passport.status === "withdrawn"} aria-busy={busy}>
            {passport.status === "published" ? "Bereits veröffentlicht" : "Jetzt veröffentlichen"}
          </button>
        </div>
        {publishedNow && <p role="status" className="notice notice-ok" style={{ marginTop: "0.75rem" }}>Der Pass ist veröffentlicht und über den QR-Code erreichbar.</p>}
        {publishError && (
          <div role="alert" className="notice notice-danger" style={{ marginTop: "0.75rem" }}>
            <strong>Veröffentlichen nicht möglich</strong>
            {publishError.message}
            {publishError.missing.length > 0 && <ul>{publishError.missing.map((field) => <li key={field.path}>{missingLabel(field)} ({responsibleLabel(field.responsible)})</li>)}</ul>}
          </div>
        )}
      </Section>

      <Section num="05" title="Änderungsprotokoll" id="log">
        <div className="table-wrap">
          <table className="table">
            <caption>Wer wann welche Abschnitte geändert hat</caption>
            <thead><tr><th scope="col">Datum</th><th scope="col">Wer</th><th scope="col">Abschnitte</th></tr></thead>
            <tbody>
              {[...contributions].reverse().map((entry, index) => (
                <tr key={entry.contribution_id ?? index}>
                  <td>{formatDate(entry.created_at)}</td>
                  <td>{entry.actor_type === "supplier" ? suppliers.find((s) => s.supplier_id === entry.actor_id)?.name ?? entry.actor_id : entry.actor_type === "brand" ? "Label" : "PassReady"}</td>
                  <td>{entry.sections.join(", ")}{entry.note ? <><br /><span className="small muted">{entry.note}</span></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </article>
  );
}
