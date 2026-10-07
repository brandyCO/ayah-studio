# Fonts

| File | Font | Source | License |
|---|---|---|---|
| `UthmanicHafs.woff2` | KFGQPC Uthmanic Script Hafs (v18) | King Fahd Glorious Quran Printing Complex, Madinah (https://qurancomplex.gov.sa). Copied from the Quran.com frontend repository (`quran/quran.com-frontend-next`, `public/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2`). | Distributed by the King Fahd Complex free of charge for non-commercial use with the Quran text; the font file may not be modified or sold. |
| `qcf-v2/p1.woff2` … `p604.woff2` | KFGQPC QCF V2 Madinah mushaf page fonts (one per page, 1441H print) | King Fahd Glorious Quran Printing Complex. Copied from the Quran.com frontend repository (`quran/quran.com-frontend-next`, `public/fonts/quran/hafs/v2/woff2/`, commit aff1a03). | Distributed by the King Fahd Complex free of charge for non-commercial use; may not be modified or sold. |
| `SuraNames.woff2` | Surah-name calligraphy font (text "001"…"114" renders the name) | Quran.com frontend repository (`public/fonts/quran/surah-names/v1/sura_names.woff2`) | As above (King Fahd Complex calligraphy, redistributed by Quran.com) |
| `bismillah.svg` | Bismillah calligraphy shown above surahs in the mushaf view | Quran.com frontend repository (`public/bismillah.svg`) | Redistributed as used by Quran.com |
| `AmiriQuran.woff2` | Amiri Quran (Arabic subset) | The Amiri Project (https://github.com/aliftype/amiri), via `@fontsource/amiri-quran` 5.3.0 | SIL Open Font License 1.1 — see `AmiriQuran-OFL.txt` |

The mushaf reading view draws pages with the QCF V2 fonts from glyph codes in
`public/data/mushaf.json` (each word's text verified against the bundled text, every glyph checked
against its page font by `scripts/verify-qcf-glyphs.py`). Video export always draws the bundled
Unicode text with the KFGQPC Uthmanic Hafs font.

The KFGQPC font is used together with the KFGQPC Hafs text (`public/data/quran-uthmani.json`),
which is the encoding it is designed for. Amiri Quran is the fallback.
