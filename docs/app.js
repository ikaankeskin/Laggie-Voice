import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

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
let mediaRecorder = null;
let chunks = [];
let timerId = null;
let startedAt = 0;
let detectedLanguage = null;
let transcriber = null;
let loadedAsrModel = null;
const translators = {};

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function setAudio(blob, name) {
  audioBlob = blob;
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

function progressCallback(report) {
  if (!report) return;
  if (report.status === "progress" && report.file) {
    const pct = Math.round(report.progress ?? 0);
    setStatus(`Downloading ${report.file} (${pct}%)…`, "busy");
  } else if (report.status === "done" && report.file) {
    setStatus(`Loaded ${report.file}`, "busy");
  }
}

function resample(channel, fromRate, toRate) {
  if (fromRate === toRate) return channel;
  const ratio = fromRate / toRate;
  const length = Math.round(channel.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = channel[Math.min(channel.length - 1, Math.round(i * ratio))];
  }
  return output;
}

async function blobToWaveform(blob) {
  const context = new AudioContext();
  const buffer = await blob.arrayBuffer();
  const audio = await context.decodeAudioData(buffer.slice(0));
  const mixed = audio.numberOfChannels === 1
    ? audio.getChannelData(0)
    : audio.getChannelData(0);
  await context.close();
  return resample(mixed, audio.sampleRate, 16000);
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
      /* ignore */
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
  if (lang === "tr") return { source: "tr", target: "en", label: "Turkish → English", model: "Xenova/opus-mt-tr-en" };
  if (lang === "en") return { source: "en", target: "tr", label: "English → Turkish", model: "Xenova/opus-mt-en-tr" };
  return null;
}

function guessLangFromText(text) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(text) ? "tr" : "en";
}

function updateTranslateAvailability() {
  const text = transcriptEl.value.trim();
  const pair = pairFor(languageEl.value) || pairFor(detectedLanguage) || pairFor(guessLangFromText(text));
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

async function getTranscriber() {
  const size = modelEl.value === "tiny" ? "tiny" : "base";
  const modelId = `Xenova/whisper-${size}`;
  if (transcriber && loadedAsrModel === modelId) return transcriber;
  setStatus(`Loading ${modelId} into this browser…`, "busy");
  transcriber = await pipeline("automatic-speech-recognition", modelId, {
    quantized: true,
    progress_callback: progressCallback,
  });
  loadedAsrModel = modelId;
  return transcriber;
}

async function getTranslator(modelId) {
  if (!translators[modelId]) {
    setStatus(`Loading ${modelId}…`, "busy");
    translators[modelId] = await pipeline("translation", modelId, {
      quantized: true,
      progress_callback: progressCallback,
    });
  }
  return translators[modelId];
}

transcribeBtn.addEventListener("click", async () => {
  if (!audioBlob) return;
  if (audioBlob.size < 2048) {
    setStatus("Audio is too short. Record a few seconds or upload a file.", "error");
    return;
  }
  transcribeBtn.disabled = true;
  setStatus("Preparing audio…", "busy");
  metaEl.textContent = "Working";
  try {
    const audio = await blobToWaveform(audioBlob);
    const asr = await getTranscriber();
    const options = { task: "transcribe" };
    if (languageEl.value === "tr") options.language = "turkish";
    if (languageEl.value === "en") options.language = "english";
    setStatus("Transcribing in the browser…", "busy");
    const result = await asr(audio, options);
    const text = (result.text || "").trim();
    transcriptEl.value = text;
    detectedLanguage = languageEl.value === "auto" ? guessLangFromText(text) : languageEl.value;
    metaEl.textContent = `${loadedAsrModel.replace("Xenova/", "")} · in-browser`;
    translationEl.value = "";
    copyTranslationBtn.disabled = true;
    downloadTranslationBtn.disabled = true;
    updateTranslateAvailability();
    setStatus(text ? "Transcription complete." : "No speech detected.", text ? "ok" : "error");
  } catch (err) {
    setStatus(err.message || String(err), "error");
    metaEl.textContent = "Failed";
  } finally {
    transcribeBtn.disabled = !audioBlob;
  }
});

translateBtn.addEventListener("click", async () => {
  const text = transcriptEl.value.trim();
  const pair = pairFor(languageEl.value) || pairFor(detectedLanguage) || pairFor(guessLangFromText(text));
  if (!text || !pair) {
    setStatus("Need a Turkish or English transcript to translate.", "error");
    return;
  }
  translateBtn.disabled = true;
  try {
    const translator = await getTranslator(pair.model);
    setStatus("Translating in the browser…", "busy");
    const result = await translator(text);
    const translated = Array.isArray(result)
      ? (result[0].translation_text || result[0].generated_text || "")
      : (result.translation_text || "");
    translationEl.value = translated.trim();
    translateMeta.textContent = pair.label;
    copyTranslationBtn.disabled = !translationEl.value;
    downloadTranslationBtn.disabled = !translationEl.value;
    setStatus("Translation complete.", "ok");
  } catch (err) {
    setStatus(err.message || String(err), "error");
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
