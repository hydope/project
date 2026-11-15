// Height — stored as centimetres (profiles.height_cm), displayed as
// feet/inches everywhere (Syed's call, 2026-11-09). No surface ever shows
// cm: the card, the detail page, the apps, and the onboarding review all
// render through cmToFeetInches(). Input accepts feet/inches or cm and
// parseHeightToCm() normalises it to cm for storage.

export function cmToFeetInches(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const totalInches = Math.round(n / 2.54);
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  return `${ft}'${inch}"`;
}

// Fold the quote characters phones actually produce back to ASCII.
// iOS/Android "smart punctuation" turns ' into ’ and " into ” (or the
// prime marks ′ ″) as you type, and this parser historically accepted
// only the ASCII forms — so 5'10" typed on an iPhone was rejected as
// invalid (Syed's report, 2026-11-14, reproduced exactly). Two single
// quotes typed for the inches mark collapse to one double quote too.
export function normalizeHeightText(value) {
  return String(value)
    .replace(/[\u2018\u2019\u02BC\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/''/g, '"')
    .trim();
}

// Parse what a member typed — 5'7", 5'7, 5 ft 7 in, 5ft7in, 170 cm, 170,
// or an old dropdown value like 5'6" (168cm) — to integer cm. Returns null
// when the input is empty or unparseable (the caller treats that as "not
// provided", never as a stored value).
export function parseHeightToCm(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }
  const s = normalizeHeightText(value);
  if (!s) return null;
  // Old dropdown values carry the cm in parens: 5'6" (168cm).
  const paren = /\((\d+(?:\.\d+)?)\s*cm\)/i.exec(s);
  if (paren) return Math.round(parseFloat(paren[1]));
  // Feet/inches: 5'7", 5'7, 5 ft 7 in, 5ft7in, 5' 7", 5 ft, 5'
  // (a trailing ' is accepted as the inches mark — a common slip).
  const ft = /^(\d+)\s*(?:'|ft)\s*(\d+)?\s*(?:"|in|')?$/i.exec(s);
  if (ft) {
    const feet = parseInt(ft[1], 10);
    const inches = ft[2] ? parseInt(ft[2], 10) : 0;
    if (feet < 3 || feet > 8 || inches < 0 || inches > 11) return null;
    return Math.round((feet * 12 + inches) * 2.54);
  }
  // Centimetres: 170 cm, 170cm, or a bare number (assumed cm).
  const cm = /^(\d+(?:\.\d+)?)\s*(cm)?$/i.exec(s);
  if (cm) {
    const n = parseFloat(cm[1]);
    if (n < 100 || n > 250) return null;
    return Math.round(n);
  }
  return null;
}

// ── Chooser parts (2026-11-14) ─────────────────────────────────────────
// Height is picked, not typed: the forms hold { feet, inches } as
// INDEPENDENT state (the DOB lesson — never derive parts back from an
// assembled value in the change loop) and derive cm only when needed.
// Parts are strings, matching <select> values; '' means "not picked".

export function cmToHeightParts(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return { feet: '', inches: '' };
  const totalInches = Math.round(n / 2.54);
  return { feet: String(Math.floor(totalInches / 12)), inches: String(totalInches % 12) };
}

export function heightPartsToCm(parts) {
  const feet = parseInt(parts?.feet, 10);
  const inches = parseInt(parts?.inches, 10);
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  if (feet < 3 || feet > 8 || inches < 0 || inches > 11) return null;
  return Math.round((feet * 12 + inches) * 2.54);
}

// One-way bridge for legacy strings (old drafts, saved text values):
// parse once, at load time only — never in a change handler.
export function heightStringToParts(value) {
  const cm = parseHeightToCm(value);
  return cm === null ? { feet: '', inches: '' } : cmToHeightParts(cm);
}
