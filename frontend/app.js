const recordBtn = document.getElementById("record-btn");
const timerEl = document.getElementById("timer");
const preview = document.getElementById("preview");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const fileLabel = document.getElementById("file-label");
const transcribeBtn = document.getElementById("transcribe-btn");
const translateBtn = document.getElementById("translate-btn");
const transcriptEl = document.getElementById("transcript");
const translationEl = document.getElementById("translation");
const metaEl = document.getElementById("meta");
const translateMeta = document.getElementById("translate-meta");
const statusEl = document.getElementById("status");
const languageEl = document.getElementById("language");
const modelEl = document.getElementById("model-size");
const copyTranscriptBtn = document.getElementById("copy-transcript");
const downloadTranscriptBtn = document.getElementById("download-transcript");
const copyTranslationBtn = document.getElementById("copy-translation");
const downloadTranslationBtn = document.getElementById("download-translation");

let audioBlob = null;
let audioName = "recording.webm";
let mediaRecorder = null;
let chunks = [];
let timerId = null;
let startedAt = 0;
let detectedLanguage = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function setAudio(blob, name) {
  audioBlob = blob;
  audioName = name;
  const url = URL.createObjectURL(blob);
  preview.src = url;
  preview.hidden = false;
  fileLabel.textContent = `${name} · ${Math.max(1, Math.round(blob.size / 1024))} KB`;
  transcribeBtn.disabled = false;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function pickMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  chunks = [];
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const type = mediaRecorder.mimeType || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(chunks, { type });
    setAudio(blob, `recording.${ext}`);
    if (blob.size < 2048) {
      setStatus("Recording is too short. Speak for a couple of seconds, then stop.", "error");
    } else {
      setStatus("Recording saved. Ready to transcribe.");
    }
  };
  mediaRecorder.start(200);
  startedAt = Date.now();
  timerEl.hidden = false;
  timerEl.textContent = "00:00";
  timerId = setInterval(() => {
    timerEl.textContent = formatTime(Date.now() - startedAt);
  }, 250);
  recordBtn.dataset.recording = "true";
  recordBtn.textContent = "Stop";
  setStatus("Recording…", "busy");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    try {
      mediaRecorder.requestData();
    } catch (_) {
      /* some browsers throw if no timeslice was set */
    }
    mediaRecorder.stop();
  }
  clearInterval(timerId);
  recordBtn.dataset.recording = "false";
  recordBtn.textContent = "Record";
}

recordBtn.addEventListener("click", async () => {
  try {
    if (recordBtn.dataset.recording === "true") {
      stopRecording();
      return;
    }
    await startRecording();
  } catch (err) {
    setStatus(`Microphone error: ${err.message}`, "error");
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) setAudio(file, file.name);
});

["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) setAudio(file, file.name);
});

function pairFor(lang) {
  if (lang === "tr") return { source: "tr", target: "en", label: "Turkish → English" };
  if (lang === "en") return { source: "en", target: "tr", label: "English → Turkish" };
  return null;
}

function updateTranslateAvailability() {
  const text = transcriptEl.value.trim();
  const pair = pairFor(languageEl.value) || pairFor(detectedLanguage);
  translateBtn.disabled = !text || !pair;
  copyTranscriptBtn.disabled = !text;
  downloadTranscriptBtn.disabled = !text;
  if (pair) translateMeta.textContent = pair.label;
}

transcriptEl.addEventListener("input", updateTranslateAvailability);
languageEl.addEventListener("change", updateTranslateAvailability);
translationEl.addEventListener("input", () => {
  const has = Boolean(translationEl.value.trim());
  copyTranslationBtn.disabled = !has;
  downloadTranslationBtn.disabled = !has;
});

async function readError(response) {
  try {
    const data = await response.json();
    return data.detail || JSON.stringify(data);
  } catch {
    return response.statusText;
  }
}

transcribeBtn.addEventListener("click", async () => {
  if (!audioBlob) return;
  if (audioBlob.size < 2048) {
    setStatus("Audio is too short or incomplete. Record a few seconds of speech or upload a file.", "error");
    return;
  }
  transcribeBtn.disabled = true;
  setStatus("Transcribing. First run may download the Whisper model…", "busy");
  metaEl.textContent = "Working";

  const body = new FormData();
  body.append("file", audioBlob, audioName);
  body.append("language", languageEl.value);
  body.append("model_size", modelEl.value);

  try {
    const response = await fetch("/api/transcribe", { method: "POST", body });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    transcriptEl.value = data.text || "";
    detectedLanguage = data.language;
    const confidence = Math.round((data.language_probability || 0) * 100);
    metaEl.textContent = `Detected ${data.language} (${confidence}%) · ${data.duration}s · ${data.model_size}`;
    translationEl.value = "";
    copyTranslationBtn.disabled = true;
    downloadTranslationBtn.disabled = true;
    updateTranslateAvailability();
    setStatus(data.text ? "Transcription complete." : "No speech detected.", data.text ? "ok" : "error");
  } catch (err) {
    setStatus(err.message, "error");
    metaEl.textContent = "Failed";
  } finally {
    transcribeBtn.disabled = !audioBlob;
  }
});

translateBtn.addEventListener("click", async () => {
  const text = transcriptEl.value.trim();
  const pair = pairFor(languageEl.value) || pairFor(detectedLanguage);
  if (!text || !pair) {
    setStatus("Need a Turkish or English transcript to translate.", "error");
    return;
  }

  translateBtn.disabled = true;
  setStatus("Translating. First run may download Argos language packs…", "busy");
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: pair.source, target: pair.target }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    translationEl.value = data.text || "";
    translateMeta.textContent = pair.label;
    copyTranslationBtn.disabled = !translationEl.value;
    downloadTranslationBtn.disabled = !translationEl.value;
    setStatus("Translation complete.", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    updateTranslateAvailability();
  }
});

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  setStatus("Copied to clipboard.", "ok");
}

function downloadText(filename, value) {
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

copyTranscriptBtn.addEventListener("click", () => copyText(transcriptEl.value));
copyTranslationBtn.addEventListener("click", () => copyText(translationEl.value));
downloadTranscriptBtn.addEventListener("click", () => downloadText("transcript.txt", transcriptEl.value));
downloadTranslationBtn.addEventListener("click", () => downloadText("translation.txt", translationEl.value));

fetch("/api/health")
  .then((res) => res.json())
  .then((data) => {
    if (!data.ffmpeg) {
      setStatus("ffmpeg was not found. Install it with brew install ffmpeg for mp3/m4a support.", "error");
    }
  })
  .catch(() => {});
