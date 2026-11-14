// Helpers only the translated bundles need (loaded with one, so English and Arabic starts stay small): ICU plurals,
// server messages put into the interface language, and which languages are written in Latin letters.
type Bundle = Record<string, Record<string, string>>;
type Vars = Record<string, string | number>;

let pr: Intl.PluralRules | null = null;
/** Picks each {n, plural, =0 {…} one {…} few {…} many {…} other {…}} by the language's rules (`#` = the number). */
export function plurals(s: string, vars: Vars, num: (v: string | number) => string, loc: string): string {
  let out = '', i = 0;
  for (;;) {
    const at = s.indexOf(', plural,', i);
    if (at < 0) return out + s.slice(i);
    const open = s.lastIndexOf('{', at);
    const name = s.slice(open + 1, at).trim();
    let depth = 0, end = open;
    for (; end < s.length; end++) { if (s[end] === '{') depth++; else if (s[end] === '}' && --depth === 0) break; }
    if (depth || !(name in vars)) return out + s.slice(i); // malformed or not given: leave it to the checker
    const forms: Record<string, string> = {};
    const body = s.slice(at + 9, end);
    for (let j = 0; j < body.length;) {
      const m = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(body.slice(j));
      if (!m) break;
      let d = 0, k = j + m[0].length - 1;
      for (; k < body.length; k++) { if (body[k] === '{') d++; else if (body[k] === '}' && --d === 0) break; }
      forms[m[1]] = body.slice(j + m[0].length, k);
      j = k + 1;
    }
    const n = Number(vars[name]);
    pr ??= new Intl.PluralRules(loc);
    const form = forms[`=${n}`] ?? forms[pr.select(n)] ?? forms.other ?? '';
    out += s.slice(i, open) + form.replace(/#/g, num(vars[name]));
    i = end + 1;
  }
}


/** Languages written in Latin letters: an untranslated English message cannot be told from them. */
export const LATIN = new Set(['en', 'id', 'tr', 'fr', 'ms', 'es', 'de', 'pt', 'sw', 'ha', 'so', 'uz', 'az', 'bs', 'sq', 'it', 'nl']);

// English messages with a part that changes → the bundle's `msg` template ({1}, {2} = the groups).
const PATTERNS: [RegExp, string][] = [
  [/^Could not play the recitation: /, '@play'],
  [/^No verified recording of surah (\d+) for (.+)$/, '@noRec'],
  [/^The recording of surah (\d+) changed since it was checked$/, '@recChanged'],
  [/^Could not download (?:the )?recitation(?: audio)? \(HTTP \d+\)$/, '@dlRecitation'],
  [/^Could not load .*\(HTTP \d+\)$/, '@load'],
  [/^Videos up to (\d+) MB, please$/, '@videoMax'],
  [/^(.+): not an image or a video$/, '@notMedia'],
  [/^Search failed \(\d+\)$/, '@search'],
  [/^Download failed \(\d+\)$/, '@download'],
  [/^(Pixabay|Pexels) is busy/, '@busy'],
  [/^(Pixabay|Pexels) is not set up$/, '@notSetUp'],
  [/^(?:The library|Pixabay|Pexels) answered \d+$/, '@libDown'],
  [/^Up to (\d+) scenes$/, '@scenes'],
  [/^Up to (\d+) downloads at a time/, '@downloads'],
  [/^HTTP \d+$/, '@load'],
  [/JWT expired|Invalid Refresh Token|refresh_token/i, '@session'],
  [/rate limit|too many requests/i, '@rate'],
  [/fetch|network|timeout|timed out/i, '@offline'],
];

/** This language's version of an English message from outside our strings, else null. */
export function bundleMsg(msg: string, bundle: Bundle | null): string | null {
  const m = bundle?.msg;
  if (!m) return null;
  const s = msg.trim();
  if (m[s]) return m[s];
  for (const [re, key] of PATTERNS) {
    const g = s.match(re);
    if (g && m[key]) return m[key].replace(/\{(\d)\}/g, (x, i: string) => g[Number(i)] ?? x);
  }
  return null;
}

/** Whether `msg` is already in a non-Latin interface language (it has a letter of its script). */
export const inOwnScript = (msg: string, current: string) => {
  const script: Record<string, RegExp | undefined> = {
    ur: /[\u0600-\u06FF]/, fa: /[\u0600-\u06FF]/, ps: /[\u0600-\u06FF]/, ckb: /[\u0600-\u06FF]/, bn: /[\u0980-\u09FF]/,
    hi: /[\u0900-\u097F]/, ru: /[\u0400-\u04FF]/, ta: /[\u0B80-\u0BFF]/, ml: /[\u0D00-\u0D7F]/, zh: /[\u4E00-\u9FFF]/,
    ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/,
  };
  return script[current]?.test(msg) ?? false;
};


// Day and month names where the browser's own date data is missing or broken for the language (Chromium has no
// Hausa, Somali, Pashto, Albanian or Kurdish dates, and prints "M11" for Uzbek, Azerbaijani and Bosnian months;
// Urdu's narrow weekdays come out as Latin letters). Dates in these languages are made with day-month order
// (en-GB's layout) and these names. Sunday first.
type Names = { narrow: string[]; days?: string[]; months?: string[] };
const NAMES: Record<string, Names> = {
  ur: { narrow: ['ا', 'پ', 'م', 'ب', 'ج', 'ج', 'س'] },
  ps: {
    narrow: ['ی', 'د', 'د', 'څ', 'پ', 'ج', 'ا'],
    days: ['یونۍ', 'دونۍ', 'درېنۍ', 'څلرنۍ', 'پينځنۍ', 'جمعه', 'اونۍ'],
    months: ['جنوري', 'فبروري', 'مارچ', 'اپریل', 'مۍ', 'جون', 'جولای', 'اګست', 'سپتمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
  },
  ckb: {
    narrow: ['ی', 'د', 'س', 'چ', 'پ', 'ھ', 'ش'],
    days: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'],
    months: ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەمموز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'],
  },
  ha: {
    narrow: ['L', 'L', 'T', 'L', 'A', 'J', 'A'],
    days: ['Lahadi', 'Litinin', 'Talata', 'Laraba', 'Alhamis', 'Jummaʼa', 'Asabar'],
    months: ['Janairu', 'Faburairu', 'Maris', 'Afirilu', 'Mayu', 'Yuni', 'Yuli', 'Agusta', 'Satumba', 'Oktoba', 'Nuwamba', 'Disamba'],
  },
  so: {
    narrow: ['A', 'I', 'T', 'A', 'Kh', 'J', 'S'],
    days: ['Axad', 'Isniin', 'Talaado', 'Arbaco', 'Khamiis', 'Jimco', 'Sabti'],
    months: ['Jannaayo', 'Febraayo', 'Maarso', 'Abriil', 'May', 'Juun', 'Luuliyo', 'Ogost', 'Sebtembar', 'Oktoobar', 'Nofembar', 'Desembar'],
  },
  sq: {
    narrow: ['d', 'h', 'm', 'm', 'e', 'p', 'sh'],
    days: ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'],
    months: ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'],
  },
  uz: {
    narrow: ['Y', 'D', 'S', 'Ch', 'P', 'J', 'Sh'],
    days: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
    months: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  },
  az: {
    narrow: ['B', 'Be', 'Ça', 'Ç', 'Ca', 'C', 'Ş'],
    days: ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'],
    months: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  },
  bs: {
    narrow: ['N', 'P', 'U', 'S', 'Č', 'P', 'S'],
    days: ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'],
    months: ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'],
  },
};

/** Puts this language's day and month names into Intl dates and Date#toLocale…String, when the browser lacks them. */
export function patchDates(lang: string) {
  const n = NAMES[lang];
  if (!n) return;
  const Native = Intl.DateTimeFormat;
  const ours = (l: unknown) => {
    const x = Array.isArray(l) ? l[0] : l;
    return typeof x === 'string' && x.toLowerCase().split('-')[0] === lang;
  };
  const latin = !/^(ps|ckb|ur)$/.test(lang);
  const short = (s: string) => (latin ? s.slice(0, 3) : s);
  class Dtf extends Native {
    readonly #mine: boolean;
    readonly #o: Intl.DateTimeFormatOptions;
    constructor(locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      const mine = ours(locales) && (!!n.months || opts?.weekday === 'narrow');
      super(mine && n.months ? 'en-GB' : locales, opts);
      this.#mine = mine;
      this.#o = opts ?? {};
    }
    override formatToParts(d?: Date | number): Intl.DateTimeFormatPart[] {
      const parts = super.formatToParts(d);
      if (!this.#mine) return parts;
      const date = d === undefined ? new Date() : new Date(d);
      return parts.map((p) => {
        if (p.type === 'month' && !/^\d+$/.test(p.value) && n.months) {
          const m = n.months[date.getMonth()];
          return { ...p, value: this.#o.month === 'long' ? m : short(m) };
        }
        if (p.type === 'weekday') {
          const w = this.#o.weekday === 'narrow' ? n.narrow[date.getDay()] : n.days?.[date.getDay()];
          return w ? { ...p, value: this.#o.weekday === 'short' ? short(w) : w } : p;
        }
        return p;
      });
    }
    override format = (d?: Date | number): string => (this.#mine ? this.formatToParts(d).map((p) => p.value).join('') : super.format(d));
  }
  (Intl as { DateTimeFormat: unknown }).DateTimeFormat = Dtf;
  const wrap = (name: 'toLocaleDateString' | 'toLocaleString' | 'toLocaleTimeString', base: Intl.DateTimeFormatOptions) => {
    const orig = Date.prototype[name];
    Date.prototype[name] = function (this: Date, locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      return ours(locales) ? new Dtf(locales, opts && Object.keys(opts).length ? opts : base).format(this) : orig.call(this, locales, opts);
    };
  };
  wrap('toLocaleDateString', { day: 'numeric', month: 'numeric', year: 'numeric' });
  wrap('toLocaleString', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' });
  wrap('toLocaleTimeString', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
}
