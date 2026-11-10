# Harakat check server

"Follow my voice" in a tasmi' shows the words as the phone's own recogniser hears them, but a phone
recogniser only hears letters. This server checks the **harakat**: the app sends each recited part (a few
seconds of 16 kHz audio, cut at a pause) with the words it found said in it, and gets back the words said
with another haraka.

- Model: `mostafanewir70/quran-recitation-ctc-onnx` (4-bit ONNX of
  `rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final`, Apache-2.0), pinned revision, checked by SHA-256,
  baked into the image.
- Method (`harakat.py`): the part is lined up with the words' exact harakat (CTC Viterbi, free audio allowed
  before and after), and each haraka is compared with the other harakat at the same moment. A word is
  flagged when the model is far surer of another haraka (`HARAKAT_FLAG`, default −6). Tested on long ayat by
  professional reciters with one haraka changed in the text: 97 % caught, 1 % of correct words flagged.
- Only signed-in users (the Supabase token is checked), 60 min of audio a day each (`MAX_SECONDS_DAY`).
  Audio is checked in memory and never stored or logged.

## API

`POST /check` with `Authorization: Bearer <Supabase access token>`:

```json
{ "audio": "<base64 16 kHz mono int16 PCM, ≤ 30 s>", "words": ["<Uthmani words>"], "said": [0, 1, 2] }
```

→ `{ "heard": "…", "words": [{ "i": 0, "score": 1.2, "flag": false }], "seconds": 4.1, "ms": 600 }`

`GET /health` → `{ "ok": true }`.

## Running it

Locally: put the model next to the code as `model.onnx`, then `AUTH_OFF=1 python server.py` (port 8080).

On Google Cloud Run (the GitHub workflow `Deploy harakat server` does this on every change):

1. Google Cloud: create a project and turn on billing (the free tier still asks for a card). Free each
   month: 180,000 vCPU-seconds, which is about 5,800 minutes of recitation checked.
2. IAM → Service accounts → create one with the roles Cloud Run Admin, Cloud Build Editor, Artifact
   Registry Admin, Service Account User, Storage Admin and Service Usage Admin → Keys → Add key → JSON.
3. GitHub repo → Settings → Secrets and variables → Actions: secret `GCP_SA_KEY` = the JSON file's
   contents; variable `GCP_PROJECT` = the project id (optional `GCP_REGION`, default `europe-west1`).
4. Actions → Deploy harakat server → Run workflow. The last line of its log is the server's address: put
   it in the repo variable `HARAKAT_URL`, and the next app build turns the check on.
5. Billing → Budgets & alerts: a budget (for example $10 a month) so any cost past the free tier is
   noticed. The server never runs more than 3 copies at once.

## Free option: Hugging Face (no card)

A Docker Space on Hugging Face's free CPU (2 vCPU, 16 GB): no card, no monthly limit, but one copy only (checks
queue when several learners recite at once, about 0.2x real time each, so ~4 learners at once) and it sleeps after 48 h unused (the first
check after that waits ~1 min while it wakes; meanwhile the app uses the phone's recogniser).

1. huggingface.co → Sign up (free). Settings → Access Tokens → Create new token → type **Write** → copy it.
2. GitHub repo → Settings → Secrets and variables → Actions → secret `HF_TOKEN` = the token.
3. Actions → Deploy harakat server (Hugging Face) → Run workflow. It creates the Space `{user}/ayah-harakat`, waits
   until it answers `/health` and prints its address on the last line: put that in the repo variable `HARAKAT_URL`.

## Making it better (teachers' labels)

Learners who turn on **Help improve the harakat check** share short clips of flagged words (and a few
unflagged ones) with their own answer at the check. Teachers label them:

1. Add a teacher (Supabase SQL editor): `insert into harakat_reviewers (user_id) select id from auth.users
   where email = 'teacher@example.com';` They sign in to the app with Google and open `#/learn/review`.
2. **Tune** (any time, a few minutes): Actions → Tune harakat check → Run workflow. The artifact
   `thresholds.json` sets a threshold per haraka from the labels (only for harakat with ≥ 40 right and ≥ 10
   wrong clips, keeping false alarms ≤ 1.5 %). Put it in `server/harakat/` and merge: the deploy picks it up.
3. **Train** (when there are a few thousand labelled clips): on a free Kaggle or Colab GPU,
   `DB_URL=… python3 scripts/harakat-clips.py clips` then `python3 scripts/harakat-finetune.py clips --out ft`.
   It prints the current and the new model's results on held-out clips; replace the image's model only when
   the new one catches more at no more false alarms. Clips are learners' voices: keep them off public places.
