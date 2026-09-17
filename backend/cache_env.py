import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"

CACHE.mkdir(parents=True, exist_ok=True)
(CACHE / "xdg-data").mkdir(exist_ok=True)
(CACHE / "xdg-cache").mkdir(exist_ok=True)
(CACHE / "xdg-config").mkdir(exist_ok=True)
(CACHE / "huggingface").mkdir(exist_ok=True)
(ROOT / ".tmp").mkdir(exist_ok=True)

os.environ.setdefault("XDG_DATA_HOME", str(CACHE / "xdg-data"))
os.environ.setdefault("XDG_CACHE_HOME", str(CACHE / "xdg-cache"))
os.environ.setdefault("XDG_CONFIG_HOME", str(CACHE / "xdg-config"))
os.environ.setdefault("HF_HOME", str(CACHE / "huggingface"))
os.environ.setdefault("ARGOS_DEVICE_TYPE", "cpu")
