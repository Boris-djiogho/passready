"""Product images: sniff the real file type, store under the media directory, attach to the
passport. Mirrors the upload rules of our other projects: JPEG/PNG/WebP only, 5 MB cap."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import HttpUrl

from app.core.config import Settings
from app.core.errors import PassReadyError
from app.models.common import utcnow
from app.models.passport import ActorType, ContributionRecord, DigitalProductPassport
from app.repositories.base import DppRepository
from app.services.passport import PassportService
from app.services.supplier_update import sha256_of

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_PASSPORT = 8


class UnsupportedImageError(PassReadyError):
    status_code = 415
    code = "unsupported_image"


class ImageTooLargeError(PassReadyError):
    status_code = 413
    code = "image_too_large"


@dataclass(frozen=True)
class ImageKind:
    extension: str
    media_type: str


def sniff_image(data: bytes) -> ImageKind:
    """Identify JPEG, PNG or WebP by magic bytes; anything else is rejected."""
    if data.startswith(b"\xff\xd8\xff"):
        return ImageKind("jpg", "image/jpeg")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ImageKind("png", "image/png")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ImageKind("webp", "image/webp")
    raise UnsupportedImageError("only JPEG, PNG and WebP images are accepted")


class MediaService:
    def __init__(self, repository: DppRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings
        self._passports = PassportService(repository, settings)

    def add_product_image(
        self,
        gtin: str,
        data: bytes,
        batch: str | None = None,
        serial: str | None = None,
    ) -> tuple[DigitalProductPassport, str]:
        if len(data) > MAX_IMAGE_BYTES:
            raise ImageTooLargeError(f"image exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
        kind = sniff_image(data)
        passport = self._passports.get(gtin, batch, serial)
        if len(passport.product.image_urls) >= MAX_IMAGES_PER_PASSPORT:
            raise PassReadyError(f"at most {MAX_IMAGES_PER_PASSPORT} images per passport")

        folder = Path(self._settings.media_dir) / "uploads" / passport.identifier.gtin
        folder.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid4().hex}.{kind.extension}"
        (folder / filename).write_bytes(data)
        base = self._settings.media_base_url.rstrip("/")
        url = f"{base}/uploads/{passport.identifier.gtin}/{filename}"

        now = utcnow()
        product = passport.product.model_copy(
            update={"image_urls": [*passport.product.image_urls, HttpUrl(url)]}
        )
        candidate = passport.model_copy(
            update={
                "product": product,
                "version": passport.version + 1,
                "updated_at": now,
                "contributions": [
                    *passport.contributions,
                    ContributionRecord(
                        actor_type=ActorType.BRAND,
                        actor_id="brand",
                        sections=["product.image_urls"],
                        payload_sha256=sha256_of(data.hex()[:4096] + filename),
                        created_at=now,
                        note=f"image added ({kind.media_type}, {len(data)} bytes)",
                    ),
                ],
            }
        )
        saved = self._repository.save(DigitalProductPassport.model_validate(candidate.model_dump()))
        return saved, url

    def set_product_images(
        self,
        gtin: str,
        image_urls: list[HttpUrl],
        batch: str | None = None,
        serial: str | None = None,
    ) -> DigitalProductPassport:
        """Reorder (first = main image) and drop images; dropped uploads are deleted from disk."""
        passport = self._passports.get(gtin, batch, serial)
        current = [str(u) for u in passport.product.image_urls]
        wanted = [str(u) for u in image_urls]
        unknown = [u for u in wanted if u not in current]
        if unknown:
            raise PassReadyError(f"unknown image URLs: {unknown}")
        if len(set(wanted)) != len(wanted):
            raise PassReadyError("image URLs must be unique")
        removed = [u for u in current if u not in wanted]
        for url in removed:
            self._delete_upload(url, passport.identifier.gtin)

        now = utcnow()
        product = passport.product.model_copy(update={"image_urls": [HttpUrl(u) for u in wanted]})
        candidate = passport.model_copy(
            update={
                "product": product,
                "version": passport.version + 1,
                "updated_at": now,
                "contributions": [
                    *passport.contributions,
                    ContributionRecord(
                        actor_type=ActorType.BRAND,
                        actor_id="brand",
                        sections=["product.image_urls"],
                        payload_sha256=sha256_of("|".join(wanted)),
                        created_at=now,
                        note=f"images reordered, {len(removed)} removed",
                    ),
                ],
            }
        )
        return self._repository.save(DigitalProductPassport.model_validate(candidate.model_dump()))

    def _delete_upload(self, url: str, gtin: str) -> None:
        """Only files inside our own uploads folder for this GTIN are ever deleted."""
        name = Path(urlparse(url).path).name
        folder = (Path(self._settings.media_dir) / "uploads" / gtin).resolve()
        target = (folder / name).resolve()
        if target.parent == folder and target.is_file():
            target.unlink()
