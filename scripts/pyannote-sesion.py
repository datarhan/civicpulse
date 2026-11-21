"""Diariza la sesión ENTERA con pyannote y escribe sus turnos, sin tocar nada más.

    HUGGINGFACE_TOKEN=… ~/.local/civicpulse-pyannote/venv/bin/python \
        scripts/pyannote-sesion.py <audio> <turnos.json> [<transcripcion.txt>]

Salida: `[{"start": s, "end": s, "speaker": "SPEAKER_NN"}, …]`, con etiquetas
GLOBALES a la sesión — una pasada, no una por trozo, que es lo que la diferencia de
la transcripción publicada. La lee `extract-speaker-map-texto.ts --turnos`.

A diferencia de `diarize-pleno.sh`, NO reescribe la transcripción publicada: es una
medida, y lo publicado no se toca para medir. Escribe por fichero temporal y
renombre, así que un proceso muerto no deja un JSON a medias. Imprime el tiempo de
pared y de CPU para que el coste se cite con un número medido.

Si se le da la transcripción publicada, compara su último sello con la duración del
audio y se niega a seguir si el audio es más corto: una descarga truncada daría
turnos que no cubren la sesión, y cada línea sin turno quedaría `UNKNOWN` sin que
nadie supiera por qué.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time

from pyannote.audio import Pipeline

audio_path, out_path = sys.argv[1], sys.argv[2]
transcripcion = sys.argv[3] if len(sys.argv) > 3 else None
token = os.environ["HUGGINGFACE_TOKEN"]

# El pleno tiene 21 escaños; con la secretaría, la intervención y el público, 30
# es holgado. Sin tope, pyannote puede partir a una misma voz en varios clústeres
# cuando cambia el micro, que es justo el fallo que esta variante quiere evitar.
MAX_SPEAKERS = int(os.environ.get("PYANNOTE_MAX_SPEAKERS", "30"))

t0 = time.time()
pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=token)
print(f"[pyannote] modelo: {time.time() - t0:.1f} s", flush=True)

if transcripcion:
    from pyannote.audio import Audio

    dur = Audio().get_duration(audio_path)
    ultimo = 0.0
    with open(transcripcion, encoding="utf-8") as f:
        for linea in f:
            m = re.match(r"^\[(\d+\.?\d*) → (\d+\.?\d*)\]", linea)
            if m:
                ultimo = max(ultimo, float(m.group(2)))
    print(f"[pyannote] audio {dur:.0f} s · última línea publicada {ultimo:.0f} s", flush=True)
    if dur + 30 < ultimo:
        sys.exit(f"[pyannote] el audio ({dur:.0f} s) acaba antes que la transcripción ({ultimo:.0f} s): ¿descarga truncada?")

# Un mp3 decodificado por trozos da a veces unas muestras de menos y pyannote
# aborta («resulted in 478895 samples instead of the expected 480000»): medido el
# 2026-11-20 en otxq2c, a los 445 s de cálculo. Un WAV de 16 kHz mono, decodificado
# una sola vez por ffmpeg, no tiene ese problema.
tmpdir = tempfile.mkdtemp(prefix="pyannote-sesion-")
wav = os.path.join(tmpdir, "audio.wav")
subprocess.run(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", audio_path, "-ac", "1", "-ar", "16000", wav],
    check=True,
)

t1, c1 = time.time(), time.process_time()
diar = pipe(wav, max_speakers=MAX_SPEAKERS)
os.remove(wav)
os.rmdir(tmpdir)
# pyannote.audio 4.x (el venv tiene 4.0.4) devuelve un objeto con
# `.speaker_diarization`; se acepta también una Annotation a secas por si cambia.
ann = getattr(diar, "speaker_diarization", diar)
turnos = [
    {"start": round(t.start, 2), "end": round(t.end, 2), "speaker": str(lbl)}
    for t, _, lbl in ann.itertracks(yield_label=True)
]
turnos.sort(key=lambda x: x["start"])
tmp = out_path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(turnos, f)
os.replace(tmp, out_path)
print(
    f"[pyannote] diarización: pared {time.time() - t1:.0f} s · CPU {time.process_time() - c1:.0f} s · "
    f"{len(set(x['speaker'] for x in turnos))} clúster(es) · {len(turnos)} turno(s) → {out_path}",
    flush=True,
)
