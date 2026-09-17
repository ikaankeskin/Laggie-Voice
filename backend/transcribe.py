import shutil
import threading
from pathlib import Path

from backend import cache_env  # noqa: F401

ALLOWED_LANGUAGES = {"auto", "tr", "en"}
ALLOWED_MODELS = {"base", "small", "medium"}
DEFAULT_MODEL = "small"

_lock = threading.Lock()
_model = None
_model_size = None
_device = None
_compute_type = None
_load_error = None


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _pick_device() -> tuple[str, str]:
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:
        pass
    return "cpu", "int8"


def whisper_status() -> dict:
    return {
        "loaded": _model is not None,
        "model_size": _model_size,
        "device": _device,
        "compute_type": _compute_type,
        "load_error": _load_error,
        "ffmpeg": ffmpeg_available(),
    }


def load_model(model_size: str = DEFAULT_MODEL):
    global _model, _model_size, _device, _compute_type, _load_error

    if model_size not in ALLOWED_MODELS:
        raise ValueError(f"Unsupported model size: {model_size}")

    with _lock:
        if _model is not None and _model_size == model_size:
            return _model

        from faster_whisper import WhisperModel

        device, compute_type = _pick_device()
        _load_error = None
        try:
            _model = WhisperModel(model_size, device=device, compute_type=compute_type)
            _model_size = model_size
            _device = device
            _compute_type = compute_type
            return _model
        except Exception as exc:
            _load_error = str(exc)
            raise


def transcribe_audio(
    audio_path: str | Path,
    language: str = "auto",
    model_size: str = DEFAULT_MODEL,
) -> dict:
    if language not in ALLOWED_LANGUAGES:
        raise ValueError("Language must be auto, tr, or en")
    if model_size not in ALLOWED_MODELS:
        raise ValueError("Model size must be base, small, or medium")

    model = load_model(model_size)
    kwargs = {"vad_filter": True, "beam_size": 5}
    if language != "auto":
        kwargs["language"] = language

    with _lock:
        segments_iter, info = model.transcribe(str(audio_path), **kwargs)
        segments = [
            {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
            }
            for segment in segments_iter
            if segment.text and segment.text.strip()
        ]

    text = " ".join(segment["text"] for segment in segments).strip()
    return {
        "text": text,
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "duration": round(float(info.duration or 0), 2),
        "model_size": model_size,
        "segments": segments,
    }
