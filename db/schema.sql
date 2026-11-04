-- PassReady: PostgreSQL schema for the JSONB-backed DPP repository.
-- The in-memory repository (app/repositories/memory.py) stores exactly the documents that
-- land in the `document` columns below, so switching storage does not change the models.
--
-- Normative anchors:
--   * prEN 18219  unique identifiers  -> gtin / batch / serial / dpp_id
--   * prEN 18221  storage, persistence, versions, backup -> dpp_version history table
--   * prEN 18246  integrity -> sha256 of every contribution payload
--   * ESPR Art. 12 registry -> only identifiers leave this database, never the documents

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dpp (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dpp_id          text        NOT NULL UNIQUE,            -- urn:uuid:... (ISO/IEC 15459 compatible)
    gtin            char(14)    NOT NULL,                    -- GS1 AI (01), normalised GTIN-14
    batch           text,                                    -- GS1 AI (10), NULL = model level
    serial          text,                                    -- GS1 AI (21), NULL = not item level
    status          text        NOT NULL,                    -- DppStatus enum value
    version         integer     NOT NULL DEFAULT 1,
    document        jsonb       NOT NULL,                    -- DigitalProductPassport.model_dump(mode="json")
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    CONSTRAINT dpp_gtin_digits CHECK (gtin ~ '^[0-9]{14}$')
);

-- One passport per granularity level; NULLs are distinct in UNIQUE, therefore the COALESCE index.
CREATE UNIQUE INDEX IF NOT EXISTS dpp_identity_idx
    ON dpp (gtin, COALESCE(batch, ''), COALESCE(serial, ''));
CREATE INDEX IF NOT EXISTS dpp_status_idx ON dpp (status);
CREATE INDEX IF NOT EXISTS dpp_document_gin ON dpp USING gin (document jsonb_path_ops);

-- Immutable version history (prEN 18221 / 18222 version access).
CREATE TABLE IF NOT EXISTS dpp_version (
    dpp_pk          uuid        NOT NULL REFERENCES dpp(id) ON DELETE CASCADE,
    version         integer     NOT NULL,
    document        jsonb       NOT NULL,
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dpp_pk, version)
);

CREATE TABLE IF NOT EXISTS supplier_invitation (
    token           text PRIMARY KEY,
    dpp_pk          uuid        NOT NULL REFERENCES dpp(id) ON DELETE CASCADE,
    supplier_id     text        NOT NULL,
    supplier_role   text        NOT NULL,
    allowed_sections text[]     NOT NULL,
    expires_at      timestamptz NOT NULL,
    revoked         boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Resolver access log; basis for pay-per-scan (consumer scans only are billable).
CREATE TABLE IF NOT EXISTS scan_event (
    id              bigserial PRIMARY KEY,
    gtin            char(14)    NOT NULL,
    batch           text,
    serial          text,
    role            text        NOT NULL,
    billable        boolean     NOT NULL,
    link_type       text,
    user_agent      text,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_event_gtin_time_idx ON scan_event (gtin, occurred_at DESC);
