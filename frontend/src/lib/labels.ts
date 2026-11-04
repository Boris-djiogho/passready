/** German UI labels for backend enums. Typed as Record so a new enum value fails the build. */

import type {
  CareSymbol,
  CertificateType,
  DppSection,
  DppStatus,
  FiberType,
  FootprintMethod,
  LifecycleBoundary,
  OperatorRole,
  RecycledSource,
  SupplierRole,
  TextileCategory,
} from "../api/client";

export const FIBER_LABELS: Record<FiberType, string> = {
  cotton: "Baumwolle",
  wool: "Wolle",
  silk: "Seide",
  linen: "Leinen",
  hemp: "Hanf",
  jute: "Jute",
  viscose: "Viskose",
  modal: "Modal",
  lyocell: "Lyocell",
  cupro: "Cupro",
  acetate: "Acetat",
  polyester: "Polyester",
  polyamide: "Polyamid",
  acrylic: "Polyacryl",
  elastane: "Elasthan",
  polypropylene: "Polypropylen",
  polyethylene: "Polyethylen",
  polylactide: "Polylactid",
  aramid: "Aramid",
  other: "Sonstige Faser",
};

export const RECYCLED_SOURCE_LABELS: Record<RecycledSource, string> = {
  pre_consumer: "Pre-Consumer",
  post_consumer: "Post-Consumer",
  mixed: "gemischt",
};

export const CARE_LABELS: Record<CareSymbol, string> = {
  wash_30: "Waschen 30 °C",
  wash_40: "Waschen 40 °C",
  wash_60: "Waschen 60 °C",
  hand_wash: "Handwäsche",
  do_not_wash: "Nicht waschen",
  bleach_allowed: "Bleichen erlaubt",
  no_bleach: "Nicht bleichen",
  tumble_dry_low: "Trockner schonend",
  tumble_dry_normal: "Trockner normal",
  no_tumble_dry: "Nicht in den Trockner",
  line_dry: "Auf der Leine trocknen",
  iron_low: "Bügeln niedrig",
  iron_medium: "Bügeln mittel",
  iron_high: "Bügeln heiß",
  do_not_iron: "Nicht bügeln",
  dry_clean_p: "Chemische Reinigung (P)",
  no_dry_clean: "Keine chemische Reinigung",
};

export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  gots: "GOTS",
  grs: "Global Recycled Standard",
  rcs: "Recycled Claim Standard",
  ocs: "Organic Content Standard",
  oeko_tex_standard_100: "OEKO-TEX Standard 100",
  oeko_tex_made_in_green: "OEKO-TEX Made in Green",
  bluesign: "bluesign",
  zdhc_mrsl: "ZDHC MRSL",
  eu_ecolabel: "EU Ecolabel",
  reach_declaration: "REACH-Erklärung",
  pfas_declaration: "PFAS-Erklärung",
  test_report: "Prüfbericht",
  other: "Sonstiger Nachweis",
};

export const ROLE_LABELS: Record<SupplierRole, string> = {
  fiber_production: "Faserherstellung",
  spinning: "Spinnerei",
  weaving: "Weberei",
  knitting: "Strickerei",
  dyeing: "Färberei",
  finishing: "Ausrüstung",
  garment_making: "Konfektion",
  trim_supplier: "Zutaten",
};

export const STATUS_LABELS: Record<DppStatus, string> = {
  draft: "Entwurf",
  pending_supplier_data: "Wartet auf Lieferanten",
  in_review: "Prüfung",
  published: "Veröffentlicht",
  withdrawn: "Zurückgezogen",
};

export const SECTION_LABELS: Record<DppSection, string> = {
  fiber_compositions: "Faserzusammensetzung",
  chemical_compliance: "Chemie und Stoffe",
  certificates: "Zertifikate",
  environmental_footprint: "Umweltfußabdruck",
  supplier_details: "Betriebsdaten",
};

export const CATEGORY_LABELS: Record<TextileCategory, string> = {
  t_shirt: "T-Shirt",
  shirt: "Hemd / Bluse",
  trousers: "Hose",
  dress: "Kleid",
  skirt: "Rock",
  jacket: "Jacke",
  coat: "Mantel",
  knitwear: "Strick",
  underwear: "Wäsche",
  sportswear: "Sport",
  accessory: "Accessoire",
  other: "Sonstiges",
};

export const METHOD_LABELS: Record<FootprintMethod, string> = {
  pef: "EU Product Environmental Footprint",
  iso_14067: "ISO 14067",
  ghg_protocol_product: "GHG Protocol Product Standard",
  other: "Andere Methode",
};

export const BOUNDARY_LABELS: Record<LifecycleBoundary, string> = {
  cradle_to_gate: "Cradle-to-Gate",
  cradle_to_grave: "Cradle-to-Grave",
};

const COMPONENT_LABELS: Record<string, string> = {
  main_fabric: "Oberstoff",
  lining: "Futter",
  rib_collar: "Bündchen",
  trim: "Zutaten",
  pocket_lining: "Taschenfutter",
};

export function componentLabel(component: string): string {
  return COMPONENT_LABELS[component] ?? component.replaceAll("_", " ");
}

export function responsibleLabel(responsible: MissingResponsible): string {
  if (!responsible) return "offen";
  if (responsible === "brand") return "Label";
  return ROLE_LABELS[responsible];
}

type MissingResponsible = SupplierRole | "brand" | null | undefined;

/** German labels for the backend's completeness rules, keyed by passport path. */
const MISSING_LABELS: Record<string, string> = {
  "identifier.gtin": "Produktkennung (GTIN)",
  "product.name": "Produktname",
  "product.taric_code": "Warennummer (TARIC)",
  "product.country_of_origin": "Herkunftsland",
  "economic_operator.eori|gln": "Betreiberkennung (EORI oder GLN)",
  fiber_compositions: "Faserzusammensetzung inkl. Rezyklatanteil",
  chemical_compliance: "Besorgniserregende Stoffe (REACH) und PFAS-Erklärung",
  "care_and_durability.care_symbols": "Pflegehinweise",
  environmental_footprint: "Umweltfußabdruck (CO₂)",
  end_of_life: "End-of-Life und Recycling",
  suppliers: "Mindestens ein Lieferant",
};

export function missingLabel(field: { path: string; label: string; label_de?: string | null }): string {
  return field.label_de ?? MISSING_LABELS[field.path] ?? field.label;
}

export const OPERATOR_ROLE_LABELS: Record<OperatorRole, string> = {
  manufacturer: "Hersteller",
  brand_owner: "Markeninhaber",
  importer: "Importeur",
  authorised_representative: "Bevollmächtigter",
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} %`;
}
