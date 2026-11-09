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

// Parse what a member typed — 5'7", 5'7, 5 ft 7 in, 5ft7in, 170 cm, 170,
// or an old dropdown value like 5'6" (168cm) — to integer cm. Returns null
// when the input is empty or unparseable (the caller treats that as "not
// provided", never as a stored value).
export function parseHeightToCm(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  // Old dropdown values carry the cm in parens: 5'6" (168cm).
  const paren = /\((\d+(?:\.\d+)?)\s*cm\)/i.exec(s);
  if (paren) return Math.round(parseFloat(paren[1]));
  // Feet/inches: 5'7", 5'7, 5 ft 7 in, 5ft7in, 5' 7", 5 ft, 5'
  const ft = /^(\d+)\s*(?:'|ft)\s*(\d+)?\s*(?:"|in)?$/i.exec(s);
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
