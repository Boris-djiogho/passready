/** Typed access to the PassReady backend. Types come from the generated OpenAPI schema. */

import type { components } from "./schema";

export type Schemas = components["schemas"];
export type ConsumerPassportView = Schemas["ConsumerPassportView"];
export type RecyclerPassportView = Schemas["RecyclerPassportView"];
export type PassportView = ConsumerPassportView | RecyclerPassportView;
export type SupplierContext = Schemas["SupplierContext"];
export type SupplierUpdateRequest = Schemas["SupplierUpdateRequest"];
export type SupplierUpdateResponse = Schemas["SupplierUpdateResponse"];
export type PassportSummary = Schemas["PassportSummary"];
export type DigitalProductPassport = Schemas["DigitalProductPassport"];
export type CompletenessReport = Schemas["CompletenessReport"];
export type MissingField = Schemas["MissingField"];
export type ChemistryScreeningResult = Schemas["ChemistryScreeningResult"];
export type SupplierInviteRequest = Schemas["SupplierInviteRequest"];
export type SupplierInviteResponse = Schemas["SupplierInviteResponse"];
export type ScanSummary = Schemas["ScanSummary"];
export type ImageUploadResponse = Schemas["ImageUploadResponse"];
export type SupplierStatus = Schemas["SupplierStatus"];
export type ReminderResponse = Schemas["ReminderResponse"];
export type OutboxMessage = Schemas["OutboxMessage"];
export type CreatePassportRequest = Schemas["CreatePassportRequest"];
export type EconomicOperator = Schemas["EconomicOperator"];
export type OperatorRole = Schemas["OperatorRole"];
export type FiberComposition = Schemas["FiberComposition"];
export type FiberComponent = Schemas["FiberComponent"];
export type Certificate = Schemas["Certificate"];
export type ChemicalCompliance = Schemas["ChemicalCompliance"];
export type SubstanceOfConcern = Schemas["SubstanceOfConcern"];
export type EnvironmentalFootprint = Schemas["EnvironmentalFootprint"];
export type Supplier = Schemas["Supplier"];
export type FiberType = Schemas["FiberType"];
export type RecycledSource = Schemas["RecycledSource"];
export type CareSymbol = Schemas["CareSymbol"];
export type CertificateType = Schemas["CertificateType"];
export type SupplierRole = Schemas["SupplierRole"];
export type DppStatus = Schemas["DppStatus"];
export type DppSection = Schemas["DppSection"];
export type TextileCategory = Schemas["TextileCategory"];
export type FootprintMethod = Schemas["FootprintMethod"];
export type LifecycleBoundary = Schemas["LifecycleBoundary"];

export type Role = "consumer" | "recycler";

const RESOLVER_BASE: string = import.meta.env.VITE_RESOLVER_BASE ?? "/resolver";
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly detail: unknown;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: string | undefined, detail: unknown, extra: Record<string, unknown>) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }

  /** Field-level issues from a 422 response. */
  get issues(): ValidationIssue[] {
    if (!Array.isArray(this.detail)) return [];
    return this.detail.filter(
      (item): item is ValidationIssue =>
        typeof item === "object" && item !== null && "msg" in item && "loc" in item,
    );
  }

  /** Missing mandatory fields from a 409 publish_blocked response. */
  get missing(): MissingField[] {
    return Array.isArray(this.extra.missing) ? (this.extra.missing as MissingField[]) : [];
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // no JSON body
    }
    const { detail, code, ...extra } = body;
    throw new ApiError(response.status, typeof code === "string" ? code : undefined, detail, extra);
  }
  return (await response.json()) as T;
}

export function digitalLinkPath(gtin: string, batch?: string | null, serial?: string | null): string {
  let path = `/01/${encodeURIComponent(gtin)}`;
  if (batch) path += `/10/${encodeURIComponent(batch)}`;
  if (serial) path += `/21/${encodeURIComponent(serial)}`;
  return path;
}

export type QrFormat = "svg" | "png";

/** URL of the label QR code (GS1 Digital Link in a QR symbol) for a passport. */
export function qrUrl(
  gtin: string,
  batch: string | null | undefined,
  serial: string | null | undefined,
  fmt: QrFormat,
  options: { download?: boolean; scale?: number } = {},
): string {
  const params = new URLSearchParams({ format: fmt });
  if (options.download) params.set("download", "true");
  if (options.scale) params.set("scale", String(options.scale));
  return `${API_BASE}/api/qr${digitalLinkPath(gtin, batch, serial)}?${params.toString()}`;
}

function qualifierQuery(batch?: string | null, serial?: string | null): string {
  const params = new URLSearchParams();
  if (batch) params.set("batch", batch);
  if (serial) params.set("serial", serial);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function resolvePassport(
  gtin: string,
  batch: string | null | undefined,
  serial: string | null | undefined,
  role: Role,
): Promise<PassportView> {
  return request<PassportView>(`${RESOLVER_BASE}${digitalLinkPath(gtin, batch, serial)}?role=${role}`);
}

export function supplierContext(gtin: string, token: string): Promise<SupplierContext> {
  return request<SupplierContext>(`${API_BASE}/api/dpp/${gtin}/supplier-update/context`, {
    headers: { "X-Supplier-Token": token },
  });
}

export function supplierUpdate(
  gtin: string,
  token: string,
  payload: SupplierUpdateRequest,
): Promise<SupplierUpdateResponse> {
  return request<SupplierUpdateResponse>(`${API_BASE}/api/dpp/${gtin}/supplier-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Supplier-Token": token },
    body: JSON.stringify(payload),
  });
}

export function brandApi(apiKey: string) {
  const headers = { "X-API-Key": apiKey };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };
  const base = `${API_BASE}/api/dpp`;
  return {
    list: () => request<PassportSummary[]>(base, { headers }),
    get: (gtin: string, batch?: string | null, serial?: string | null) =>
      request<DigitalProductPassport>(`${base}/${gtin}${qualifierQuery(batch, serial)}`, { headers }),
    completeness: (gtin: string, batch?: string | null, serial?: string | null) =>
      request<CompletenessReport>(`${base}/${gtin}/completeness${qualifierQuery(batch, serial)}`, {
        headers,
      }),
    chemistryCheck: (gtin: string, batch?: string | null, serial?: string | null) =>
      request<ChemistryScreeningResult>(
        `${base}/${gtin}/chemistry-check${qualifierQuery(batch, serial)}`,
        { headers },
      ),
    invite: (gtin: string, payload: SupplierInviteRequest) =>
      request<SupplierInviteResponse>(`${base}/${gtin}/suppliers`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      }),
    publish: (gtin: string, batch?: string | null, serial?: string | null) =>
      request<DigitalProductPassport>(`${base}/${gtin}/publish${qualifierQuery(batch, serial)}`, {
        method: "POST",
        headers,
      }),
    scans: (gtin: string) => request<ScanSummary>(`${base}/${gtin}/scans`, { headers }),
    create: (payload: CreatePassportRequest) =>
      request<DigitalProductPassport>(base, { method: "POST", headers: jsonHeaders, body: JSON.stringify(payload) }),
    setImages: (gtin: string, imageUrls: string[], batch?: string | null, serial?: string | null) =>
      request<DigitalProductPassport>(`${base}/${gtin}/images${qualifierQuery(batch, serial)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ image_urls: imageUrls }),
      }),
    supplierStatuses: (gtin: string, batch?: string | null, serial?: string | null) =>
      request<SupplierStatus[]>(`${base}/${gtin}/suppliers${qualifierQuery(batch, serial)}`, { headers }),
    remind: (gtin: string, supplierId: string, note: string | null, batch?: string | null, serial?: string | null) =>
      request<ReminderResponse>(`${base}/${gtin}/suppliers/${supplierId}/remind${qualifierQuery(batch, serial)}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ note }),
      }),
    uploadImage: (gtin: string, file: File, batch?: string | null, serial?: string | null) => {
      const form = new FormData();
      form.append("file", file, file.name);
      return request<ImageUploadResponse>(`${base}/${gtin}/images${qualifierQuery(batch, serial)}`, {
        method: "POST",
        headers,
        body: form,
      });
    },
  };
}

export type BrandApi = ReturnType<typeof brandApi>;
