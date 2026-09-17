import asyncio
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import cache_env  # noqa: F401  — set local model cache paths
from backend.transcribe import (
    ALLOWED_LANGUAGES,
    ALLOWED_MODELS,
    DEFAULT_MODEL,
    ffmpeg_available,
    transcribe_audio,
    whisper_status,
)
from backend.translate import translate_status, translate_text

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
ALLOWED_SUFFIXES = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".mp4", ".aac", ".flac", ".aiff", ".aif", ".caf"}

app = FastAPI(title="Laggie-Voice", version="0.1.0")


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1)
    source: str
    target: str


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "ffmpeg": ffmpeg_available(),
        "whisper": whisper_status(),
        "translate": translate_status(),
    }


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    model_size: str = Form(DEFAULT_MODEL),
):
    language = (language or "auto").lower()
    model_size = (model_size or DEFAULT_MODEL).lower()

    if language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Language must be auto, tr, or en")
    if model_size not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail="Model size must be base, small, or medium")

    suffix = Path(file.filename or "audio.webm").suffix.lower() or ".webm"
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {suffix}. Use wav, mp3, m4a, webm, ogg, or aiff.",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=ROOT / ".tmp") as tmp:
            tmp_path = Path(tmp.name)
            while chunk := await file.read(1024 * 1024):
                tmp.write(chunk)

        if tmp_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        result = await asyncio.to_thread(transcribe_audio, tmp_path, language, model_size)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "End of file" in message or "Invalid data" in message:
            raise HTTPException(
                status_code=400,
                detail="Audio file is empty or truncated. Record a few seconds of speech or upload a complete file.",
            ) from exc
        raise HTTPException(status_code=500, detail=message) from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@app.post("/api/translate")
async def translate(body: TranslateRequest):
    try:
        return await asyncio.to_thread(translate_text, body.text, body.source.lower(), body.target.lower())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
async def index():
    return FileResponse(FRONTEND / "index.html")


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
