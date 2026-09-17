import re
import threading
from pathlib import Path

from backend import cache_env  # noqa: F401

ALLOWED_LANGS = {"tr", "en"}
NEEDED = (("tr", "en"), ("en", "tr"))

_lock = threading.Lock()
_ready = False
_load_error = None
_engines: dict[tuple[str, str], tuple] = {}


def translate_status() -> dict:
    return {"ready": _ready, "load_error": _load_error}


def _has_package(installed, from_code: str, to_code: str) -> bool:
    return any(
        getattr(pkg, "from_code", None) == from_code
        and getattr(pkg, "to_code", None) == to_code
        for pkg in installed
    )


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [part for part in parts if part] or [text.strip()]


def ensure_packages() -> None:
    global _ready, _load_error

    with _lock:
        if _ready:
            return

        # Import package only — argostranslate.translate pulls Stanza/Torch and hangs.
        from argostranslate import package

        try:
            installed = package.get_installed_packages()
            missing = [pair for pair in NEEDED if not _has_package(installed, *pair)]
            if missing:
                import zipfile

                from argostranslate import settings

                package.update_package_index()
                available = package.get_available_packages()
                for from_code, to_code in missing:
                    match = next(
                        (
                            pkg
                            for pkg in available
                            if pkg.from_code == from_code and pkg.to_code == to_code
                        ),
                        None,
                    )
                    if match is None:
                        raise RuntimeError(
                            f"No Argos Translate package found for {from_code} → {to_code}"
                        )
                    downloaded = Path(match.download())
                    with zipfile.ZipFile(downloaded) as zipf:
                        zipf.extractall(path=settings.package_data_dir)
            _ready = True
            _load_error = None
        except Exception as exc:
            _load_error = str(exc)
            raise


def _get_engine(source: str, target: str):
    key = (source, target)
    if key in _engines:
        return _engines[key]

    import ctranslate2
    from argostranslate import package

    pkg = next(
        item
        for item in package.get_installed_packages()
        if item.from_code == source and item.to_code == target
    )
    model_dir = Path(pkg.package_path) / "model"
    translator = ctranslate2.Translator(str(model_dir), device="cpu", compute_type="int8")
    _engines[key] = (translator, pkg)
    return _engines[key]


def translate_text(text: str, source: str, target: str) -> dict:
    if source not in ALLOWED_LANGS or target not in ALLOWED_LANGS:
        raise ValueError("Source and target must be tr or en")
    if source == target:
        raise ValueError("Source and target must be different")
    if not text or not text.strip():
        raise ValueError("Text is required")

    ensure_packages()
    translator, pkg = _get_engine(source, target)
    sentences = _split_sentences(text.strip())
    tokenized = [pkg.tokenizer.encode(sentence) for sentence in sentences]
    batches = translator.translate_batch(
        tokenized,
        beam_size=2,
        replace_unknowns=True,
        max_batch_size=32,
        batch_type="tokens",
    )
    pieces = []
    for batch in batches:
        decoded = pkg.tokenizer.decode(batch.hypotheses[0])
        if decoded.startswith(" "):
            decoded = decoded[1:]
        pieces.append(decoded)

    return {
        "text": " ".join(pieces).strip(),
        "source": source,
        "target": target,
    }
