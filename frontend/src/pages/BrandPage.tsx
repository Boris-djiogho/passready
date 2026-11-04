/** Brand dashboard: passports with completeness, images, suppliers and reminders, QR code,
 * chemistry check, publishing, change log, and creating new passports. */

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
  type ReminderResponse,
  type ScanSummary,
  type SupplierInviteResponse,
  type SupplierRole,
  type SupplierStatus,
  brandApi,
  digitalLinkPath,
  qrUrl,
} from "../api/client";
import { NewPassportForm } from "../components/NewPassportForm";
import { countryName, usePageTitle } from "../lib/a11y";
import { ROLE_LABELS, STATUS_LABELS, formatDate, missingLabel, responsibleLabel } from "../lib/labels";

const STORAGE_KEY = "passready.brandApiKey";
const CHEMISTRY_ROLES: SupplierRole[] = ["dyeing", "finishing", "trim_supplier"];

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
  const [creating, setCreating] = useState(false);

  const api = apiKey ? brandApi(apiKey) : null;

  const load = useCallback(async (): Promise<PassportSummary[]> => {
    if (!api) return [];
    setError(null);
    try {
      const list = await api.list();
      setPassports(list);
      setSelected((current) => (current ? list.find((p) => p.dpp_id === current.dpp_id) ?? list[0] ?? null : list[0] ?? null));
      return list;
    } catch (caught) {
      setPassports(null);
      setError(caught instanceof ApiError && caught.status === 401 ? "Der API-Key wird nicht akzeptiert." : String(caught));
      return [];
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

  const onCreated = async (created: DigitalProductPassport) => {
    const list = await load();
    const entry = list.find((p) => p.dpp_id === created.identifier.dpp_id) ?? null;
    setSelected(entry);
    setCreating(false);
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
            <div className="row between" style={{ marginBottom: "0.5rem" }}>
              <h2 id="h-articles" className="eyebrow">Artikel</h2>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setCreating(true)} aria-pressed={creating}>Neuer Artikel</button>
            </div>
            <ul className="link-list">
              {passports.map((passport) => (
                <li key={passport.dpp_id}>
                  <button
                    type="button"
                    aria-current={!creating && selected?.dpp_id === passport.dpp_id ? "true" : undefined}
                    onClick={() => {
                      setCreating(false);
                      setSelected(passport);
                    }}
                  >
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
              {passports.length === 0 && <li className="muted" style={{ padding: "0.9rem 0" }}>Noch kein Artikel angelegt.</li>}
            </ul>
          </aside>
          {creating ? (
            <NewPassportForm api={api} template={passports[0] ?? null} onCreated={onCreated} onCancel={() => setCreating(false)} />
          ) : (
            selected && <PassportDetail key={selected.dpp_id} api={api} summary={selected} onChanged={load} />
          )}
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

function PassportDetail({ api, summary, onChanged }: { api: BrandApi; summary: PassportSummary; onChanged: () => Promise<PassportSummary[]> }) {
  const { gtin, batch, serial } = summary;
  const [passport, setPassport] = useState<DigitalProductPassport | null>(null);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [scans, setScans] = useState<ScanSummary | null>(null);
  const [statuses, setStatuses] = useState<SupplierStatus[]>([]);
  const [chemistry, setChemistry] = useState<ChemistryScreeningResult | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; missing: MissingField[] } | null>(null);
  const [publishedNow, setPublishedNow] = useState(false);
  const [invite, setInvite] = useState<SupplierInviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<ReminderResponse | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ objectUrl: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [p, r, s, st] = await Promise.all([
      api.get(gtin, batch, serial),
      api.completeness(gtin, batch, serial),
      api.scans(gtin),
      api.supplierStatuses(gtin, batch, serial),
    ]);
    setPassport(p);
    setReport(r);
    setScans(s);
    setStatuses(st);
    if (p.chemical_compliance) {
      try {
        setChemistry(await api.chemistryCheck(gtin, batch, serial));
      } catch {
        setChemistry(null);
      }
    } else {
      setChemistry(null);
    }
  }, [api, gtin, batch, serial]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(qrUrl(gtin, batch, serial, "svg"))
      .then(async (response) => {
        if (!response.ok) throw new Error(`QR-Code konnte nicht geladen werden (${response.status})`);
        const link = response.headers.get("X-Digital-Link") ?? "";
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setQr({ objectUrl, link });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [gtin, batch, serial]);

  const run = async (action: () => Promise<void>, onError: (message: string) => void) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      onError(caught instanceof ApiError ? (typeof caught.detail === "string" ? caught.detail : "Die Angaben wurden nicht akzeptiert.") : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const onPublishClick = async () => {
    setPublishError(null);
    setBusy(true);
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
    await run(
      async () => {
        const response = await api.invite(gtin, {
          supplier: {
            name: String(data.get("name") ?? ""),
            role: String(data.get("role")) as SupplierRole,
            tier: Number(data.get("tier") ?? 1),
            country: String(data.get("country") ?? "").toUpperCase(),
            contact_email: String(data.get("email") ?? "").trim() || null,
            data_status: "pending",
            reminder_count: 0,
          },
          batch,
          serial,
        });
        setInvite(response);
        form.reset();
        await refresh();
      },
      setInviteError,
    );
  };

  const onRemind = async (supplierId: string) => {
    setReminderError(null);
    setReminder(null);
    await run(
      async () => {
        setReminder(await api.remind(gtin, supplierId, null, batch, serial));
        await refresh();
      },
      setReminderError,
    );
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("image") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadMessage(null);
    await run(
      async () => {
        const response = await api.uploadImage(gtin, file, batch, serial);
        setUploadMessage(`Bild gespeichert. Der Pass hat jetzt ${response.image_urls.length} Produktbild${response.image_urls.length === 1 ? "" : "er"}; das erste erscheint im Pass zuerst.`);
        form.reset();
        await refresh();
      },
      setUploadError,
    );
  };

  const setImages = async (urls: string[]) => {
    setImageError(null);
    await run(async () => {
      await api.setImages(gtin, urls, batch, serial);
      await refresh();
    }, setImageError);
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
    } catch {
      setCopiedLink(null);
    }
  };

  if (!passport || !report) return <p role="status" className="empty">Pass wird geladen …</p>;

  const suppliers = passport.suppliers ?? [];
  const contributions = passport.contributions ?? [];
  const imageUrls = passport.product.image_urls ?? [];
  const inviteLink = invite ? `${window.location.origin}/supplier/${gtin}?token=${invite.token}` : null;
  const pendingChemistrySuppliers = statuses.filter((s) => CHEMISTRY_ROLES.includes(s.supplier.role) && s.supplier.data_status === "pending");

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

      <Section num="01" title="Produktbilder" id="images">
        {imageUrls.length === 0 ? (
          <p className="muted">Noch kein Bild. Das erste Bild erscheint oben im Pass, weitere als Galerie.</p>
        ) : (
          <ul className="thumbs" aria-label="Produktbilder">
            {imageUrls.map((url, index) => (
              <li key={url}>
                <img src={url} alt={`Produktbild ${index + 1} von ${passport.product.name}`} />
                {index === 0 ? <span className="main-tag">Hauptbild</span> : <span className="main-tag">Bild {index + 1}</span>}
                <span className="thumb-actions">
                  {index > 0 && (
                    <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => void setImages([url, ...imageUrls.filter((u) => u !== url)])}>
                      Als Hauptbild
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet btn-small" disabled={busy} aria-label={`Bild ${index + 1} entfernen`} onClick={() => void setImages(imageUrls.filter((u) => u !== url))}>
                    Entfernen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form className="upload-row" onSubmit={onUpload}>
          <div className="field">
            <label htmlFor="image-file">Produktbild hinzufügen</label>
            <input id="image-file" name="image" type="file" accept="image/jpeg,image/png,image/webp" required aria-describedby="image-hint" />
            <span className="field-hint" id="image-hint">JPEG, PNG oder WebP, höchstens 5 MB. Neue Bilder landen hinten; mit „Als Hauptbild" nach vorn holen.</span>
          </div>
          <button className="btn btn-quiet" type="submit" disabled={busy}>Hochladen</button>
        </form>
        {uploadMessage && <p role="status" className="notice notice-ok" style={{ marginTop: "0.75rem" }}>{uploadMessage}</p>}
        {(uploadError || imageError) && <p role="alert" className="notice notice-danger" style={{ marginTop: "0.75rem" }}>{uploadError ?? imageError}</p>}
      </Section>

      <Section num="02" title="Vollständigkeit" id="completeness">
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

      <Section num="03" title="Lieferanten" id="suppliers">
        {suppliers.length === 0 ? (
          <p className="muted">Noch keine Lieferanten hinterlegt. Laden Sie unten Weberei, Färberei oder Konfektion ein.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>Beteiligte Betriebe, Stand ihrer Daten und Erinnerungen</caption>
              <thead>
                <tr><th scope="col">Betrieb</th><th scope="col">Rolle</th><th scope="col">Daten</th><th scope="col">Einladung</th><th scope="col">Aktion</th></tr>
              </thead>
              <tbody>
                {statuses.map(({ supplier, days_waiting, reminder_due, invitation_valid_until, portal_link }) => (
                  <tr key={supplier.supplier_id}>
                    <td>
                      {supplier.name}
                      <br />
                      <span className="small muted">Tier {supplier.tier} · {countryName(supplier.country)}{supplier.contact_email ? ` · ${supplier.contact_email}` : " · keine E-Mail"}</span>
                    </td>
                    <td>{ROLE_LABELS[supplier.role]}</td>
                    <td>
                      {supplier.data_status === "pending" ? (
                        <>
                          <span className={`status ${reminder_due ? "status-danger" : "status-warn"}`}>
                            {reminder_due ? "Erinnerung fällig" : "ausstehend"}
                          </span>
                          <br />
                          <span className="small muted">
                            wartet seit {days_waiting} Tag{days_waiting === 1 ? "" : "en"}
                            {supplier.last_reminded_at ? `, zuletzt erinnert am ${formatDate(supplier.last_reminded_at)} (${supplier.reminder_count}×)` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="status status-ok">{supplier.data_status === "submitted" ? "geliefert" : "geprüft"}</span>
                      )}
                    </td>
                    <td>
                      {invitation_valid_until ? (
                        <span className="small">gültig bis {formatDate(invitation_valid_until)}</span>
                      ) : (
                        <span className="small muted">{supplier.data_status === "pending" ? "kein offener Link" : "–"}</span>
                      )}
                    </td>
                    <td>
                      <span className="cell-actions">
                        {supplier.data_status === "pending" && (
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void onRemind(supplier.supplier_id ?? "")}>
                            {supplier.reminder_count > 0 ? "Erneut erinnern" : "Erinnern"}
                          </button>
                        )}
                        {portal_link && (
                          <button type="button" className="btn btn-quiet btn-small" onClick={() => void copyLink(portal_link)} aria-label={`Einladungslink für ${supplier.name} kopieren`}>
                            {copiedLink === portal_link ? "Kopiert" : "Link kopieren"}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reminderError && <p role="alert" className="notice notice-danger" style={{ marginTop: "0.75rem" }}>{reminderError}</p>}
        {reminder && (
          <div role="status" className="notice notice-ok" style={{ marginTop: "0.75rem" }}>
            <strong>Erinnerung an {reminder.supplier_name} vorbereitet ({reminder.reminder_count}. Erinnerung)</strong>
            {reminder.warnings.length > 0 && <ul>{reminder.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <p className="small" style={{ marginTop: "0.5rem" }}>Betreff: {reminder.message.subject}</p>
            <pre className="mail">{reminder.message.body}</pre>
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void copyLink(reminder.message.body)}>
                {copiedLink === reminder.message.body ? "Text kopiert" : "Text kopieren"}
              </button>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void copyLink(reminder.portal_link)}>
                {copiedLink === reminder.portal_link ? "Link kopiert" : "Link kopieren"}
              </button>
            </div>
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
              <div className="field"><label htmlFor="inv-email">E-Mail für Erinnerungen</label><input id="inv-email" name="email" type="email" autoComplete="off" /></div>
            </div>
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <button className="btn" type="submit" disabled={busy}>Einladungslink erzeugen</button>
            </div>
          </fieldset>
          {inviteError && <p role="alert" className="notice notice-danger" style={{ marginTop: "0.75rem" }}>{inviteError}</p>}
          {invite && inviteLink && (
            <div role="status" className="notice notice-ok" style={{ marginTop: "0.75rem" }}>
              <strong>Link für {ROLE_LABELS[invite.supplier_role]}, gültig bis {formatDate(invite.expires_at)}</strong>
              <code>{inviteLink}</code>
              <div className="btn-row" style={{ marginTop: "0.75rem" }}>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => void copyLink(inviteLink)}>{copiedLink === inviteLink ? "Link kopiert" : "Link kopieren"}</button>
                <Link className="btn btn-quiet btn-small" to={`/supplier/${gtin}?token=${invite.token}`}>Formular öffnen</Link>
              </div>
            </div>
          )}
        </form>
      </Section>

      <Section num="04" title="QR-Code für das Etikett" id="qr">
        <figure className="qr-figure">
          {qr ? (
            <img src={qr.objectUrl} alt={`QR-Code, führt zu ${qr.link}`} width={176} height={176} />
          ) : (
            <p role="status" className="muted">QR-Code wird erzeugt …</p>
          )}
          <figcaption>
            <span>Der Code enthält nur die GS1-Digital-Link-Adresse des Passes. Derselbe Code ist an der Kasse als GTIN lesbar und führt auf dem Handy zum Pass.</span>
            {qr?.link && <code>{qr.link}</code>}
            <span className="muted">Fehlerkorrektur M, Ruhezone von vier Modulen ist enthalten. Im Druck mindestens 15 mm Kantenlänge.</span>
            <span className="btn-row">
              <a className="btn btn-quiet btn-small" href={qrUrl(gtin, batch, serial, "svg", { download: true })} download>SVG für den Druck</a>
              <a className="btn btn-quiet btn-small" href={qrUrl(gtin, batch, serial, "png", { download: true, scale: 12 })} download>PNG</a>
            </span>
          </figcaption>
        </figure>
      </Section>

      <Section
        num="05"
        title="Chemie-Check"
        id="chemistry"
        actions={passport.chemical_compliance ? <button className="btn btn-quiet btn-small" type="button" onClick={() => void refresh()}>Erneut prüfen</button> : undefined}
      >
        <p className="small muted">Abgleich der gemeldeten Stoffe mit der REACH-Kandidatenliste und der PFAS-Beschränkung. Läuft automatisch, sobald Chemiedaten vorliegen.</p>
        {!passport.chemical_compliance && (
          <div className="notice notice-warn" style={{ marginTop: "0.75rem" }}>
            <strong>Noch keine Chemiedaten</strong>
            {pendingChemistrySuppliers.length > 0 ? (
              <>
                Zuständig: {pendingChemistrySuppliers.map((s) => `${s.supplier.name} (${ROLE_LABELS[s.supplier.role]})`).join(", ")}. Die Erklärung steht noch aus;{" "}
                <a href="#h-suppliers">in der Lieferantenliste erinnern</a>.
              </>
            ) : (
              <>Laden Sie Färberei oder Ausrüstung als Lieferant ein; sie liefern die REACH- und PFAS-Erklärung.</>
            )}
          </div>
        )}
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
            {chemistry.findings.length === 0 && chemistry.notes.length === 0 && <p className="small muted">Keine Treffer in den Referenzlisten. Die gemeldeten Stoffe und die PFAS-Angabe passen zusammen.</p>}
          </div>
        )}
      </Section>

      <Section num="06" title="Veröffentlichen" id="publish">
        <p className="small muted">Erst wenn alle Pflichtangaben vorliegen, wird der Pass über den QR-Code erreichbar.</p>
        <div className="btn-row" style={{ marginTop: "0.75rem" }}>
          <button className="btn btn-primary" type="button" onClick={() => void onPublishClick()} disabled={busy || passport.status === "published" || passport.status === "withdrawn"} aria-busy={busy}>
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

      <Section num="07" title="Änderungsprotokoll" id="log">
        <div className="table-wrap">
          <table className="table">
            <caption>Wer wann welche Abschnitte geändert hat</caption>
            <thead><tr><th scope="col">Datum</th><th scope="col">Wer</th><th scope="col">Abschnitte</th></tr></thead>
            <tbody>
              {[...contributions].reverse().map((entry, index) => (
                <tr key={entry.contribution_id ?? String(index)}>
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
