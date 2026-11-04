"""Pydantic data models: the textile DPP schema and its role-specific read models.

Module map
----------
common        shared base classes, ``Role`` enum, constrained scalar types
identifiers   GTIN / batch / serial (GS1 AI 01, 10, 21) and the passport URN
actors        economic operator (brand, manufacturer, importer) and supply-chain suppliers
materials     fibre composition incl. recycled content
environment   product carbon footprint and related indicators
chemistry     substances of concern, REACH / PFAS declarations
certificates  third-party certificates with integrity hash
circularity   care, durability, repair and end-of-life information
passport      the aggregate ``DigitalProductPassport`` and its audit trail
completeness  gap report against the mandatory data set
views         consumer / recycler / authority read models (role-based routing)
supplier      supplier invitations and the supplier-update contract
brand         brand-side request/response models
scan          resolver access events (pay-per-scan)
"""
