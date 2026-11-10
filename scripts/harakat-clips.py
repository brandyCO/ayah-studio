#!/usr/bin/env python3
"""Downloads the harakat clips learners shared (supabase/migrations/20261111000000_harakat_clips.sql) into a
folder for scripts/harakat-tune.py and scripts/harakat-finetune.py: one 16 kHz mono WAV per clip and
clips.jsonl (id, surah, ayah, words, target, score, flagged, learner, label). No user ids are exported.

  DB_URL=postgresql://… python3 scripts/harakat-clips.py OUT_DIR

Needs psql. DB_URL is the database's connection string (the GitHub workflow builds it from the
SUPABASE_DB_PASSWORD secret); it is never written anywhere."""
import base64, json, os, subprocess, sys, wave

out = sys.argv[1] if len(sys.argv) > 1 else 'harakat-clips'
os.makedirs(os.path.join(out, 'wav'), exist_ok=True)
q = """copy (select json_build_object('id', id, 'surah', surah, 'ayah', ayah, 'words', words, 'target', target,
  'score', score, 'flagged', flagged, 'learner', learner, 'label', label, 'audio', replace(encode(audio, 'base64'), E'\n', ''))
  from public.harakat_clips order by id) to stdout"""
raw = subprocess.run(['psql', os.environ['DB_URL'], '-X', '-q', '-c', q], check=True, capture_output=True, text=True).stdout
n = 0
with open(os.path.join(out, 'clips.jsonl'), 'w', encoding='utf-8') as f:
    for line in raw.splitlines():
        if not line.strip():
            continue
        c = json.loads(line.replace('\\\\', '\\'))
        pcm = base64.b64decode(c.pop('audio').replace('\\n', '').replace('\n', ''))
        with wave.open(os.path.join(out, 'wav', f"{c['id']}.wav"), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(pcm)
        f.write(json.dumps(c, ensure_ascii=False) + '\n')
        n += 1
print(f'{n} clips in {out}')
