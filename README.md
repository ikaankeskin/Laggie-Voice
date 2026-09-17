# Laggie-Voice

A local web app for **Turkish and English** speech. Record in the browser or drop an existing file, get a transcript with [faster-whisper](https://github.com/SYSTRAN/faster-whisper), then translate **Turkish ↔ English** offline with Argos Translate.

Audio stays on the machine that runs the app. This version does not read the transcript aloud.

**[Open the in-browser demo](https://ikaankeskin.github.io/Laggie-Voice/)** — GitHub Pages runs Whisper in your tab. Quality is lower than the local app.

---

## What it was designed for

Laggie-Voice was built as a **private TR/EN studio for voice recordings**:

- You have a clip (or you can hit Record) in Turkish or English
- You want text, not a cloud transcription API
- You often need the other language as well, not only a transcript
- You do not need text-to-speech yet

Typical first use: interview notes, class recordings, voice memos, and bilingual messages you would rather not upload.

## What else it can be used for

The same loop — **speech → text → the other language** — is useful beyond that original job:

- Meeting and lecture notes when typing would get in the way
- Language study: listen, read the transcript, compare the translation
- First-pass subtitles or captions (you will still want to edit)
- Accessibility: turn a recording into something you can search or share as text
- Family or work voice notes that cross Turkish and English
- Research or fieldwork with bilingual speech
- Checking whether a clip is actually Turkish, English, or mixed (auto-detect)

It is not a live captioning tool, not a meeting bot, and not a replacement for a human translator on legal or medical text.

---

## Two ways to run it

| | Local app (this repo) | GitHub Pages demo |
| --- | --- | --- |
| Where it runs | Your computer | Your browser tab |
| Engine | faster-whisper + Argos | Transformers.js (Whisper + Opus-MT) |
| Privacy | Fully local after models download | Models come from Hugging Face, audio stays in the tab |
| Quality | Better, especially Turkish | Lighter demo quality |
| First download | Whisper `small` ~500 MB | Whisper `base` plus translation packs |

Use the **local app** when the recording matters. Use the **demo** to try the idea with no install.

---

## Local setup

### Requirements

- Python 3.11 or newer
- [ffmpeg](https://ffmpeg.org/) (needed for mp3, m4a, and most other formats)

macOS:

```bash
brew install ffmpeg
```

Ubuntu/Debian:

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

Windows: install Python 3.11+ and ffmpeg, then use the same `venv` steps in PowerShell (`python -m venv .venv` then `.venv\Scripts\activate`).

### Install

```bash
cd Laggie-Voice
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The first **transcribe** downloads a Whisper model (about **150 MB** for `base`, **500 MB** for `small`). The first **translate** downloads Argos Turkish↔English packs. Those files are cached under `.cache/` in this folder.

### Run

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

1. Record a few seconds of speech, or upload `wav`, `mp3`, `m4a`, `webm`, `ogg`, or `aiff`
2. Set language to **Turkish** or **English** when you know it (more accurate than Auto)
3. Start with Whisper **small**; use **base** for speed or **medium** for tougher Turkish audio
4. Transcribe, then Translate
5. Copy or download `.txt`

CPU transcription can take longer than the recording. Speak for more than a second — a tap on Record is not enough audio.

### Docker

```bash
docker build -t laggie-voice .
docker run --rm -p 8000:8000 laggie-voice
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

### GitHub Codespaces

This repo includes a [devcontainer](.devcontainer/devcontainer.json). On GitHub: **Code → Codespaces → Create codespace**. After install, the app should forward port **8000** so you can use it in the browser preview. That is the full Python app, not the lighter Pages demo.

---

## In-browser demo (GitHub Pages)

The site in [`docs/`](docs/) is a static page that runs Whisper and Opus-MT **in the browser**. No Python server. Live URL: [https://ikaankeskin.github.io/Laggie-Voice/](https://ikaankeskin.github.io/Laggie-Voice/).

Local preview of the demo:

```bash
cd docs
python3 -m http.server 5500
```

Open [http://127.0.0.1:5500](http://127.0.0.1:5500).

---

## Project layout

```
backend/          FastAPI, Whisper, Argos
frontend/         Local-app UI (served by FastAPI)
docs/             GitHub Pages demo (runs in the browser)
```

## Privacy

The local app does not call OpenAI or any transcription API. Models are downloaded once from Hugging Face / Argos, then used on disk. Do not commit `.cache/` or recordings.

## Not in this version

- Text-to-speech / voice-over
- Live streaming captions
- Accounts, sharing, or a hosted API
