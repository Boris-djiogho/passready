/** Brand dashboard: passports with completeness, supplier invitations, chemistry check, publish. */

import { type FormEvent, useCallback, useEffect, useState } from "react";
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
      setSelected((current) => current ? list.find((p) => p.dpp_id === current.dpp_id) ?? list[0] ?? null : list[0] ?? null);
    } catch (caught) {
      setPassports(null);
      setError(caught instanceof ApiError && caught.status === 401 ? "API-Key wird nicht akzeptiert." : String(caught));
    }
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = (event: FormEvent) => {
    event.preventDefault();
    try {
      window.sessionStorage.setItem(STORAGE_KEY, draftKey);
    } catch {
      // storage unavailable; key stays in memory
    }
    setApiKey(draftKey);
  };

  return (
    <main className="page wide">
      <div className="row between">
        <div>
          <p className="eyebrow">Brand-Dashboard</p>
          <h1>Produktpässe</h1>
        </div>
        <form className="row" onSubmit={saveKey}>
          <input className="field" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }} type="password" placeholder="X-API-Key" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
          <button className="btn small" type="submit">Anmelden</button>
          <button className="btn small" type="button" onClick={() => { setDraftKey("demo-brand-key"); setApiKey("demo-brand-key"); }}>Demo-Key</button>
        </form>
      </div>

      {!api && <div className="card empty">Bitte mit dem API-Key des Labels anmelden.</div>}
      {error && <div className="alert danger">{error}</div>}

      {api && passports && (
        <div className="grid-2">
          <section className="card">
            <h2>Artikel</h2>
            <ul className="list">
              {passports.map((passport) => (
                <li key={passport.dpp_id} className={`clickable ${selected?.dpp_id === passport.dpp_id ? "selected" : ""}`} onClick={() => setSelected(passport)}>
                  <div>
                    <strong>{passport.product_name}</strong>
                    <div className="small muted">
                      <code>{passport.gtin}</code>
                      {passport.batch ? ` · Charge ${passport.batch}` : " · Modellebene"}
                    </div>
                  </div>
                  <StatusChip status={passport.status} />
                </li>
              ))}
            </ul>
          </section>
          {selected && <PassportDetail key={selected.dpp_id} api={api} summary={selected} onChanged={load} />}
        </div>
      )}
    </main>
  );
}

function StatusChip({ status }: { status: PassportSummary["status"] }) {
  const tone = status === "published" ? "ok" : status === "in_review" ? "accent" : status === "withdrawn" ? "danger" : "warn";
  return <span className={`chip ${tone}`}>{STATUS_LABELS[status]}</span>;
}

function PassportDetail({ api, summary, onChanged }: { api: BrandApi; summary: PassportSummary; onChanged: () => Promise<void> }) {
  const { gtin, batch, serial } = summary;
  const [passport, setPassport] = useState<DigitalProductPassport | null>(null);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [scans, setScans] = useState<ScanSummary | null>(null);
  const [chemistry, setChemistry] = useState<ChemistryScreeningResult | null>(null);
  const [chemistryError, setChemistryError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; missing: MissingField[] } | null>(null);
  const [invite, setInvite] = useState<SupplierInviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
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
    const form = new FormData(event.currentTarget);
    setInviteError(null);
    setBusy(true);
    try {
      const response = await api.invite(gtin, {
        supplier: {
          name: String(form.get("name") ?? ""),
          role: String(form.get("role")) as SupplierRole,
          tier: Number(form.get("tier") ?? 1),
          country: String(form.get("country") ?? "").toUpperCase(),
          data_status: "pending",
        },
        batch,
        serial,
      });
      setInvite(response);
      event.currentTarget.reset();
      await refresh();
    } catch (caught) {
      setInviteError(caught instanceof ApiError ? JSON.stringify(caught.detail) : String(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!passport || !report) return <section className="card empty">Pass wird geladen …</section>;

  const suppliers = passport.suppliers ?? [];
  const contributions = passport.contributions ?? [];

  const supplierLink = invite ? `${window.location.origin}/supplier/${gtin}?token=${invite.token}` : null;

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>{passport.product.name}</h2>
            <p className="small muted">
              GTIN <code>{gtin}</code>{batch ? <>, Charge <code>{batch}</code></> : null}{serial ? <>, Serial <code>{serial}</code></> : null} · Version {passport.version}
              {passport.published_at ? ` · veröffentlicht ${formatDate(passport.published_at)}` : ""}
            </p>
          </div>
          <div className="row">
            <StatusChip status={passport.status} />
            <Link className="btn small" to={digitalLinkPath(gtin, batch, serial)}>Pass ansehen</Link>
          </div>
        </div>
        {scans && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Scans: {scans.total} gesamt, {scans.billable} abrechenbar (Verbraucher). Behörden- und Recycler-Aufrufe sind frei.
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Vollständigkeit</h2>
          <span className={`chip ${report.complete ? "ok" : "warn"}`}>{report.score} %</span>
        </div>
        <div className="bar score"><span style={{ width: `${report.score}%` }} /></div>
        {report.missing.length > 0 ? (
          <ul className="list" style={{ marginTop: 10 }}>
            {report.missing.map((field) => (
              <li key={field.path}>
                <div>
                  <strong>{missingLabel(field)}</strong>
                  <div className="tiny muted">{field.source}</div>
                </div>
                <span className="chip warn">{responsibleLabel(field.responsible)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted" style={{ marginTop: 8 }}>Alle Pflichtangaben liegen vor.</p>
        )}
        {report.recommended_missing.length > 0 && (
          <p className="tiny muted" style={{ marginTop: 8 }}>Empfohlen, noch offen: {report.recommended_missing.map((f) => missingLabel(f)).join(", ")}</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Lieferanten</h2>
        </div>
        <ul className="list">
          {suppliers.map((supplier) => (
            <li key={supplier.supplier_id}>
              <div>
                <strong>{supplier.name}</strong>
                <div className="small muted">{ROLE_LABELS[supplier.role]} · Tier {supplier.tier} · {supplier.country}</div>
              </div>
              <span className={`chip ${supplier.data_status === "pending" ? "warn" : "ok"}`}>
                {supplier.data_status === "pending" ? "ausstehend" : supplier.data_status === "submitted" ? "geliefert" : "geprüft"}
              </span>
            </li>
          ))}
          {suppliers.length === 0 && <li className="muted">Noch keine Lieferanten hinterlegt.</li>}
        </ul>
        <form className="stack" style={{ marginTop: 12 }} onSubmit={onInvite}>
          <h3>Lieferant einladen</h3>
          <div className="form-grid">
            <label className="field"><span>Name</span><input name="name" required /></label>
            <label className="field"><span>Rolle</span>
              <select name="role" defaultValue="weaving">
                {(Object.keys(ROLE_LABELS) as SupplierRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <label className="field"><span>Tier</span><input name="tier" type="number" min={1} max={4} defaultValue={2} /></label>
            <label className="field"><span>Land (ISO)</span><input name="country" maxLength={2} placeholder="PT" required /></label>
          </div>
          <div><button className="btn" type="submit" disabled={busy}>Einladungslink erzeugen</button></div>
          {inviteError && <div className="alert danger">{inviteError}</div>}
          {invite && supplierLink && (
            <div className="alert ok">
              Link für {ROLE_LABELS[invite.supplier_role]} (gültig bis {formatDate(invite.expires_at)}):
              <br />
              <code className="tiny" style={{ overflowWrap: "anywhere" }}>{supplierLink}</code>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(supplierLink)}>Kopieren</button>
                <Link className="btn small" to={`/supplier/${gtin}?token=${invite.token}`}>Formular öffnen</Link>
              </div>
            </div>
          )}
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Chemie-Check</h2>
          <button className="btn small" type="button" onClick={() => void runChemistry()}>Prüfen</button>
        </div>
        {chemistryError && <div className="alert warn">{chemistryError}</div>}
        {chemistry && (
          <div className="stack">
            <div className="row">
              <span className={`chip ${chemistry.risk_level === "high" ? "danger" : chemistry.risk_level === "review" ? "warn" : "ok"}`}>
                Risiko: {chemistry.risk_level === "high" ? "hoch" : chemistry.risk_level === "review" ? "prüfen" : "keins"}
              </span>
              <span className={`chip ${chemistry.pfas_claim_consistent ? "ok" : "danger"}`}>PFAS-Angabe {chemistry.pfas_claim_consistent ? "konsistent" : "widersprüchlich"}</span>
              <span className="chip">Liste {chemistry.reference_list_version}</span>
            </div>
            {chemistry.findings.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Gemeldet</th><th>Treffer</th><th>Listen</th><th>Konz.</th></tr></thead>
                  <tbody>
                    {chemistry.findings.map((finding, index) => (
                      <tr key={index}>
                        <td>{finding.declared_name}<br /><code className="tiny">{finding.cas_number ?? ""}</code></td>
                        <td>{finding.matched_name}</td>
                        <td>{finding.matched_lists.join(", ")}</td>
                        <td>{finding.concentration_percent} %{finding.above_svhc_threshold ? " (über Schwelle)" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {chemistry.notes.length > 0 && <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{chemistry.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
            {chemistry.findings.length === 0 && chemistry.notes.length === 0 && <p className="small muted">Keine Treffer in den Referenzlisten.</p>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Veröffentlichen</h2>
          <button className="btn primary" type="button" onClick={() => void publish()} disabled={busy || passport.status === "published" || passport.status === "withdrawn"}>
            {passport.status === "published" ? "Bereits veröffentlicht" : "Jetzt veröffentlichen"}
          </button>
        </div>
        <p className="small muted">Veröffentlichen ist erst möglich, wenn alle Pflichtangaben vorliegen. Danach erreichen Verbraucher und Recycler den Pass über den QR-Code.</p>
        {publishError && (
          <div className="alert danger" style={{ marginTop: 10 }}>
            {publishError.message}
            {publishError.missing.length > 0 && <ul>{publishError.missing.map((field) => <li key={field.path}>{missingLabel(field)} ({responsibleLabel(field.responsible)})</li>)}</ul>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Änderungsprotokoll</h2>
        <ul className="list">
          {[...contributions].reverse().map((entry, index) => (
            <li key={entry.contribution_id ?? index}>
              <div>
                <strong>{entry.actor_type === "supplier" ? suppliers.find((s) => s.supplier_id === entry.actor_id)?.name ?? entry.actor_id : entry.actor_type === "brand" ? "Label" : "PassReady"}</strong>
                <div className="small muted">{entry.sections.join(", ")}{entry.note ? ` · ${entry.note}` : ""}</div>
              </div>
              <span className="tiny muted">{formatDate(entry.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
