/** Create a passport draft: identifiers, product basics, care symbols, responsible operator. */

import { type FormEvent, useEffect, useState } from "react";

import {
  ApiError,
  type BrandApi,
  type CareSymbol,
  type CreatePassportRequest,
  type DigitalProductPassport,
  type EconomicOperator,
  type OperatorRole,
  type PassportSummary,
  type TextileCategory,
} from "../api/client";
import { CARE_LABELS, CATEGORY_LABELS, OPERATOR_ROLE_LABELS } from "../lib/labels";

interface OperatorDraft {
  name: string;
  role: OperatorRole;
  eori: string;
  gln: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  contact_email: string;
  website: string;
}

const EMPTY_OPERATOR: OperatorDraft = {
  name: "", role: "brand_owner", eori: "", gln: "", street: "", postal_code: "", city: "", country: "DE", contact_email: "", website: "",
};

function fromOperator(operator: EconomicOperator): OperatorDraft {
  return {
    name: operator.name,
    role: operator.role,
    eori: operator.eori ?? "",
    gln: operator.gln ?? "",
    street: operator.address.street,
    postal_code: operator.address.postal_code,
    city: operator.address.city,
    country: operator.address.country,
    contact_email: operator.contact_email ?? "",
    website: operator.website ?? "",
  };
}

export function NewPassportForm({
  api,
  template,
  onCreated,
  onCancel,
}: {
  api: BrandApi;
  template: PassportSummary | null;
  onCreated: (passport: DigitalProductPassport) => Promise<void>;
  onCancel: () => void;
}) {
  const [gtin, setGtin] = useState("");
  const [batch, setBatch] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TextileCategory>("t_shirt");
  const [description, setDescription] = useState("");
  const [taric, setTaric] = useState("");
  const [country, setCountry] = useState("");
  const [color, setColor] = useState("");
  const [weight, setWeight] = useState("");
  const [care, setCare] = useState<CareSymbol[]>([]);
  const [operator, setOperator] = useState<OperatorDraft>(EMPTY_OPERATOR);
  const [operatorFromTemplate, setOperatorFromTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    api
      .get(template.gtin, template.batch, template.serial)
      .then((passport) => {
        if (!cancelled) {
          setOperator(fromOperator(passport.economic_operator));
          setOperatorFromTemplate(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, template]);

  const update = (patch: Partial<OperatorDraft>) => setOperator((current) => ({ ...current, ...patch }));
  const toggleCare = (symbol: CareSymbol) =>
    setCare((current) => (current.includes(symbol) ? current.filter((s) => s !== symbol) : [...current, symbol]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);
    const payload: CreatePassportRequest = {
      identifier: { gtin: gtin.trim(), batch: batch.trim() || null },
      product: {
        name: name.trim(),
        category,
        description: description.trim() || null,
        taric_code: taric.trim() || null,
        country_of_origin: country.trim() ? country.trim().toUpperCase() : null,
        color: color.trim() || null,
        weight_g: weight ? Number(weight) : null,
      },
      economic_operator: {
        name: operator.name.trim(),
        role: operator.role,
        eori: operator.eori.trim() || null,
        gln: operator.gln.trim() || null,
        address: {
          street: operator.street.trim(),
          postal_code: operator.postal_code.trim(),
          city: operator.city.trim(),
          country: operator.country.trim().toUpperCase(),
        },
        contact_email: operator.contact_email.trim() || null,
        website: operator.website.trim() || null,
      },
      care_and_durability: care.length > 0 ? { care_symbols: care } : null,
    };
    try {
      const created = await api.create(payload);
      await onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 409) setError("Für diese GTIN und Charge gibt es bereits einen Pass.");
        else if (caught.status === 422 && caught.issues.length > 0) {
          setError("Bitte die folgenden Angaben prüfen:");
          setIssues(caught.issues.map((issue) => `${issue.loc.filter((p) => p !== "body").join(" › ")}: ${issue.msg}`));
        } else setError(String(caught.detail));
      } else setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="new-title" className="stack-lg">
      <header className="detail-head">
        <h2 id="new-title" className="display" style={{ fontSize: "1.75rem" }}>Neuer Artikel</h2>
        <p className="muted">
          Der Pass startet als Entwurf. Danach laden Sie Lieferanten ein, die ihre Abschnitte selbst ausfüllen, und veröffentlichen, sobald alle Pflichtangaben vorliegen.
        </p>
      </header>

      {error && (
        <div role="alert" className="notice notice-danger">
          <strong>{error}</strong>
          {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </div>
      )}

      <fieldset className="section">
        <legend className="section-title"><span className="num" aria-hidden="true">01</span><h3>Kennung</h3></legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-gtin">GTIN (Pflicht)</label>
            <input id="new-gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} inputMode="numeric" required minLength={8} maxLength={14} aria-describedby="new-gtin-hint" />
            <span className="field-hint" id="new-gtin-hint">8, 12, 13 oder 14 Ziffern, die Nummer unter dem Strichcode</span>
          </div>
          <div className="field">
            <label htmlFor="new-batch">Charge (optional)</label>
            <input id="new-batch" value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={20} aria-describedby="new-batch-hint" />
            <span className="field-hint" id="new-batch-hint">Leer lassen für einen Pass auf Modellebene</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend className="section-title"><span className="num" aria-hidden="true">02</span><h3>Produkt</h3></legend>
        <div className="form-grid">
          <div className="field"><label htmlFor="new-name">Produktname (Pflicht)</label><input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} /></div>
          <div className="field"><label htmlFor="new-category">Kategorie</label>
            <select id="new-category" value={category} onChange={(e) => setCategory(e.target.value as TextileCategory)}>
              {(Object.keys(CATEGORY_LABELS) as TextileCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="new-taric">Warennummer (TARIC)</label><input id="new-taric" value={taric} onChange={(e) => setTaric(e.target.value)} inputMode="numeric" aria-describedby="new-taric-hint" /><span className="field-hint" id="new-taric-hint">8 oder 10 Ziffern, z. B. 61091000 für Baumwoll-T-Shirts</span></div>
          <div className="field"><label htmlFor="new-country">Herkunftsland</label><input id="new-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} autoCapitalize="characters" aria-describedby="new-country-hint" /><span className="field-hint" id="new-country-hint">Zwei Buchstaben, Land des letzten wesentlichen Fertigungsschritts</span></div>
          <div className="field"><label htmlFor="new-color">Farbe</label><input id="new-color" value={color} onChange={(e) => setColor(e.target.value)} maxLength={100} /></div>
          <div className="field"><label htmlFor="new-weight">Gewicht in Gramm</label><input id="new-weight" type="number" inputMode="decimal" min="1" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="new-description">Beschreibung</label>
          <textarea id="new-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </div>
      </fieldset>

      <fieldset className="section">
        <legend className="section-title"><span className="num" aria-hidden="true">03</span><h3>Pflegesymbole</h3></legend>
        <div className="check-grid">
          {(Object.keys(CARE_LABELS) as CareSymbol[]).map((symbol) => (
            <label className="check" key={symbol}>
              <input type="checkbox" checked={care.includes(symbol)} onChange={() => toggleCare(symbol)} />
              {CARE_LABELS[symbol]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend className="section-title"><span className="num" aria-hidden="true">04</span><h3>Verantwortlicher Betreiber</h3></legend>
        {operatorFromTemplate && (
          <p className="small muted" style={{ marginBottom: "0.75rem" }}>
            Übernommen aus Ihren bestehenden Pässen: <strong>{operator.name}</strong>. Bei Bedarf unten anpassen.
          </p>
        )}
        <details className="operator" open={!operatorFromTemplate}>
          <summary>Betreiberdaten {operatorFromTemplate ? "anzeigen und ändern" : "eingeben"}</summary>
          <div className="form-grid" style={{ marginTop: "0.75rem" }}>
            <div className="field"><label htmlFor="op-name">Firma (Pflicht)</label><input id="op-name" value={operator.name} onChange={(e) => update({ name: e.target.value })} required /></div>
            <div className="field"><label htmlFor="op-role">Rolle</label>
              <select id="op-role" value={operator.role} onChange={(e) => update({ role: e.target.value as OperatorRole })}>
                {(Object.keys(OPERATOR_ROLE_LABELS) as OperatorRole[]).map((role) => <option key={role} value={role}>{OPERATOR_ROLE_LABELS[role]}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="op-eori">EORI</label><input id="op-eori" value={operator.eori} onChange={(e) => update({ eori: e.target.value })} aria-describedby="op-id-hint" /></div>
            <div className="field"><label htmlFor="op-gln">GLN</label><input id="op-gln" value={operator.gln} onChange={(e) => update({ gln: e.target.value })} inputMode="numeric" aria-describedby="op-id-hint" /></div>
            <span className="field-hint" id="op-id-hint" style={{ gridColumn: "1 / -1" }}>Mindestens eine Betreiberkennung ist Pflicht: EORI (Zoll) oder GLN (GS1).</span>
            <div className="field"><label htmlFor="op-street">Straße und Nummer (Pflicht)</label><input id="op-street" value={operator.street} onChange={(e) => update({ street: e.target.value })} required /></div>
            <div className="field"><label htmlFor="op-postal">PLZ (Pflicht)</label><input id="op-postal" value={operator.postal_code} onChange={(e) => update({ postal_code: e.target.value })} required /></div>
            <div className="field"><label htmlFor="op-city">Ort (Pflicht)</label><input id="op-city" value={operator.city} onChange={(e) => update({ city: e.target.value })} required /></div>
            <div className="field"><label htmlFor="op-country">Land (Pflicht)</label><input id="op-country" value={operator.country} onChange={(e) => update({ country: e.target.value })} required maxLength={2} autoCapitalize="characters" /></div>
            <div className="field"><label htmlFor="op-email">Kontakt-E-Mail</label><input id="op-email" type="email" value={operator.contact_email} onChange={(e) => update({ contact_email: e.target.value })} /></div>
            <div className="field"><label htmlFor="op-web">Website (https)</label><input id="op-web" type="url" value={operator.website} onChange={(e) => update({ website: e.target.value })} /></div>
          </div>
        </details>
      </fieldset>

      <div className="btn-row">
        <button className="btn btn-primary btn-arrow" type="submit" disabled={busy} aria-busy={busy}>Entwurf anlegen</button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
