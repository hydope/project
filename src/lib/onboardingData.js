// ─────────────────────────────────────────────────────────────────────────────
// Canonical domain options for Shia Rishta.
// Single source of truth so the onboarding wizard, advanced search filters,
// and profile pages never drift apart. Culturally precise, not generic.
// ─────────────────────────────────────────────────────────────────────────────

export const SECTS = [
  'Ithna Ashari (Twelver)',
  'Ismaili',
  'Bohra (Dawoodi)',
  'Zaydi',
  'Alevi',
  'Other / Prefer not to say'
];

export const MARJA_OPTIONS = [
  'Ayatollah al-Sistani',
  'Ayatollah al-Khamenei',
  'Ayatollah al-Shirazi',
  'Ayatollah al-Hakim',
  'Ayatollah al-Sadr (via wakeel)',
  'Not following a specific Marja yet',
  "I don't know what a Marja' is yet",
  'Prefer not to say'
];

export const RELIGIOSITY_LEVELS = [
  { value: 'very-practicing', label: 'Very practicing', desc: 'Prayer, fasting & daily faith habits are central to my life' },
  { value: 'practicing', label: 'Practicing', desc: 'Consistent prayers and an actively faith-led lifestyle' },
  { value: 'moderately', label: 'Moderately practicing', desc: 'Faith matters — I am growing steadily' },
  { value: 'learning', label: 'Reconnecting / learning', desc: 'Rebuilding my relationship with the deen' },
  { value: 'cultural', label: 'Culturally connected', desc: 'Identity & heritage are my focus right now' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say', desc: 'I would rather keep this private' }
];

export const PRAYER_OPTIONS = [
  'All 5 daily prayers',
  'Mostly daily',
  'Weekly / Jumu\'ah',
  'Occasionally',
  'Private matter'
];

export const MODESTY_OPTIONS_FEMALE = [
  'Hijab — always observed',
  'Hijab — working towards it',
  'Modest dress, no hijab yet',
  'Prefer not to say'
];

export const MODESTY_OPTIONS_MALE = [
  'Beard — always kept',
  'Beard — sometimes kept',
  'Clean shaven',
  'Prefer not to say'
];

export const DIET_OPTIONS = [
  'Halal only',
  'Halal & Kitab',
  'Vegetarian',
  'Vegan',
  'No restrictions',
  'Prefer not to say'
];

export const SYED_OPTIONS = [
  { value: 'sadat-both', label: 'Syed / Sadat — both sides' },
  { value: 'syed-paternal', label: 'Yes — Syed (paternal)' },
  { value: 'non-syed', label: 'No' },
  { value: 'prefer', label: 'Prefer not to say' }
];

export const MARITAL_STATUS_OPTIONS = [
  'Never married',
  'Divorced',
  'Widowed',
  'Khula\'a',
  'Second marriage seeking'
];

export const TIMELINE_OPTIONS = [
  { value: 'now', label: 'Ready for nikah now', desc: 'Actively seeking — could be married within months' },
  { value: '6m', label: 'Within 6 months', desc: 'Serious search, near-term nikah' },
  { value: '1y', label: 'Within 6–12 months', desc: 'Intentional with a clear plan' },
  { value: '2y', label: 'Within 1–2 years', desc: 'Preparing — career / studies first' },
  { value: 'exploring', label: 'Exploring openly', desc: 'Open timeline, right match matters most' }
];

export const RELOCATION_OPTIONS = [
  { value: 'anywhere', label: 'Willing to relocate anywhere' },
  { value: 'same-country', label: 'Same country preferred' },
  { value: 'same-city', label: 'Same city / region only' },
  { value: 'discuss', label: 'Open to discussion' }
];

export const FAMILY_INVOLVEMENT_OPTIONS = [
  { value: 'from-start', label: 'Family involved from the start' },
  { value: 'after-match', label: 'After initial compatibility is clear' },
  { value: 'wali-required', label: 'Wali / guardian involved via profile link' },
  { value: 'couple-first', label: 'We decide first, then families meet' }
];

export const CHILDREN_OPTIONS = [
  'No children',
  'Children — living with me',
  'Children — not living with me',
  'Open to children in future'
];

export const CHILDREN_PLANS_OPTIONS = [
  'Want children, insha\'Allah',
  'Open to children',
  'Prefer no children',
  'Undecided'
];

// Photo privacy — the platform's signature control. The labels say exactly
// what the server enforces (2026-11-09): public means ANYONE, members means
// any signed-in member, private means only you. The old 'request'/'match'
// options promised features that never existed (no photo requests; both
// normalized to 'members' at save), so they are gone.
export const PHOTO_ACCESS_OPTIONS = [
  { value: 'public', label: 'Visible to everyone', desc: 'Anyone — even signed-out visitors — can view your photos', icon: 'globe' },
  { value: 'members', label: 'Members only', desc: 'Any signed-in member can view your photos', icon: 'user' },
  { value: 'private', label: 'Only me', desc: 'Nobody else can view your photos', icon: 'lock' }
];

export const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Discoverable', desc: 'Shown in search results and browse' },
  { value: 'limited', label: 'Limited visibility', desc: 'Only members matching your preferences see you' },
  { value: 'hidden', label: 'Hidden / incognito', desc: 'Browse freely — nobody sees your profile' }
];

export const MANAGEMENT_MODES = [
  { value: 'self', label: 'Self-managed', desc: 'I run my own profile and conversations', icon: 'user' },
  { value: 'guardian', label: 'Parent / Guardian-managed', desc: 'A wali or family member reviews and approves activity', icon: 'shield' }
];

const EDUCATION_LEVELS_BASE = [
  'High school',
  'Some college',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate (PhD / MD / JD)',
  'Islamic seminary (Hawza)',
  'Vocational / Trade'
];

// A member may keep their own education private; a partner PREFERENCE of
// "Prefer not to say" would be meaningless, so the preference list below
// is built from the base list without it.
export const EDUCATION_OPTIONS = [...EDUCATION_LEVELS_BASE, 'Prefer not to say'];

// ── Income: the member picks their own currency (Syed's order, 2026-11-19)
// and then a yearly band in THAT currency. Bands are self-declared ranges,
// roughly equivalent across currencies at typical exchange rates — they are
// not converted or compared across currencies. The chosen band's LABEL is
// what gets stored in income_range (it carries its own currency symbol);
// income_currency stores the code alongside. 'Prefer not to say' is always
// the first band, in every currency.
export const INCOME_CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar (AUD)' },
  { code: 'AED', symbol: 'AED ', label: 'UAE Dirham (AED)' },
  { code: 'SAR', symbol: 'SAR ', label: 'Saudi Riyal (SAR)' },
  { code: 'QAR', symbol: 'QAR ', label: 'Qatari Riyal (QAR)' },
  { code: 'KWD', symbol: 'KD ', label: 'Kuwaiti Dinar (KWD)' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR)' },
  { code: 'PKR', symbol: 'Rs ', label: 'Pakistani Rupee (PKR)' },
  { code: 'BDT', symbol: '৳', label: 'Bangladeshi Taka (BDT)' },
  { code: 'LKR', symbol: 'Rs ', label: 'Sri Lankan Rupee (LKR)' },
  { code: 'MYR', symbol: 'RM ', label: 'Malaysian Ringgit (MYR)' },
  { code: 'ZAR', symbol: 'R ', label: 'South African Rand (ZAR)' },
  { code: 'KES', symbol: 'KSh ', label: 'Kenyan Shilling (KES)' },
  { code: 'TZS', symbol: 'TSh ', label: 'Tanzanian Shilling (TZS)' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira (NGN)' },
];

const INCOME_BAND_SETS = {
  _western: (s) => [`Under ${s}40k`, `${s}40k – ${s}75k`, `${s}75k – ${s}120k`, `${s}120k – ${s}200k`, `${s}200k+`],
  _gulf: (s) => [`Under ${s}150k`, `${s}150k – ${s}275k`, `${s}275k – ${s}450k`, `${s}450k – ${s}750k`, `${s}750k+`],
  KWD: (s) => [`Under ${s}15k`, `${s}15k – ${s}25k`, `${s}25k – ${s}40k`, `${s}40k – ${s}65k`, `${s}65k+`],
  INR: (s) => [`Under ${s}5 lakh`, `${s}5–10 lakh`, `${s}10–20 lakh`, `${s}20–35 lakh`, `${s}35 lakh+`],
  PKR: (s) => [`Under ${s}15 lakh`, `${s}15–30 lakh`, `${s}30–60 lakh`, `${s}60 lakh – 1 crore`, `${s}1 crore+`],
  BDT: (s) => [`Under ${s}6 lakh`, `${s}6–12 lakh`, `${s}12–24 lakh`, `${s}24–40 lakh`, `${s}40 lakh+`],
  LKR: (s) => [`Under ${s}3m`, `${s}3–6m`, `${s}6–10m`, `${s}10–18m`, `${s}18m+`],
  MYR: (s) => [`Under ${s}50k`, `${s}50–90k`, `${s}90–150k`, `${s}150–250k`, `${s}250k+`],
  ZAR: (s) => [`Under ${s}300k`, `${s}300–550k`, `${s}550–900k`, `${s}900k – 1.5m`, `${s}1.5m+`],
  KES: (s) => [`Under ${s}500k`, `${s}500–900k`, `${s}900k – 1.5m`, `${s}1.5–2.5m`, `${s}2.5m+`],
  TZS: (s) => [`Under ${s}10m`, `${s}10–20m`, `${s}20–35m`, `${s}35–60m`, `${s}60m+`],
  NGN: (s) => [`Under ${s}3m`, `${s}3–6m`, `${s}6–10m`, `${s}10–18m`, `${s}18m+`],
};

export function incomeBandsFor(currencyCode) {
  const entry = INCOME_CURRENCIES.find(c => c.code === currencyCode) || INCOME_CURRENCIES[0];
  const make = INCOME_BAND_SETS[entry.code]
    || (['AED', 'SAR', 'QAR'].includes(entry.code) ? INCOME_BAND_SETS._gulf : INCOME_BAND_SETS._western);
  return ['Prefer not to say', ...make(entry.symbol)];
}

// Sensible starting currency from the member's country; the member can
// always change it. Countries without a supported currency fall back to USD.
export const COUNTRY_CURRENCY = {
  'USA': 'USD', 'Canada': 'CAD', 'United Kingdom': 'GBP', 'Germany': 'EUR',
  'France': 'EUR', 'Netherlands': 'EUR', 'Australia': 'AUD', 'UAE': 'AED',
  'Saudi Arabia': 'SAR', 'Qatar': 'QAR', 'Kuwait': 'KWD', 'Pakistan': 'PKR',
  'India': 'INR', 'Tanzania': 'TZS', 'Kenya': 'KES',
};

export function defaultIncomeCurrency(country) {
  return COUNTRY_CURRENCY[country] || 'USD';
}

export const BUILD_OPTIONS = ['Slim', 'Athletic', 'Average build', 'Heavyset', 'Prefer not to say'];

export const RESIDENCY_OPTIONS = [
  'Citizen', 'Permanent resident', 'Work visa', 'Student visa', 'Other visa', 'Prefer not to say',
];

// Convert status (2026-11-10): respectful wording, never a label that
// singles anyone out — 'Revert to Islam' is the term reverts themselves use.
export const CONVERT_OPTIONS = ['Born Muslim', 'Revert to Islam', 'Prefer not to say'];

export const HOBBIES = [
  'Reading', 'Cooking', 'Travel', 'Hiking', 'Cricket', 'Football',
  'Gym & fitness', 'Gardening', 'Photography', 'Calligraphy',
  'Volunteering', 'Quran study', 'Islamic lectures', 'Gaming', 'Fishing', 'Art & design',
];

// Partner preferences (2026-11-10): structured, stored on the profile and
// editable in Settings. These are the viewer's own criteria — they power
// the match sort, they are never browse filters on other people.
export const PREF_EDUCATION_OPTIONS = ['Any', ...EDUCATION_LEVELS_BASE];

export const LANGUAGES = [
  'English', 'Arabic', 'Urdu', 'Hindi', 'Farsi / Persian', 'Turkish',
  'Bengali', 'Punjabi', 'Gujarati', 'Swahili', 'French', 'German',
  'Spanish', 'Iraqi Arabic', 'Azeri', 'Kurdish', 'Other'
];

export const ETHNICITIES = [
  'South Asian', 'Arab — Levantine', 'Arab — Gulf', 'Arab — North African',
  'Persian / Iranian', 'Turkish', 'East African', 'South-East Asian',
  'European', 'North American', 'Mixed heritage', 'Other'
];

// Optional sub-ethnicity / community within each broad group (2026-10-24).
// Shown only when the chosen ethnicity has entries here; members who prefer
// just the broad group skip it entirely — it is never required and never
// scored in completeness. 'Mixed heritage' and 'Other' intentionally have no
// list: a single sub-choice doesn't make sense for them.
export const SUB_ETHNICITIES = {
  'South Asian': ['Indian', 'Pakistani', 'Bangladeshi', 'Sri Lankan', 'Nepali', 'Afghan', 'Kashmiri', 'Hyderabadi', 'Other South Asian'],
  'Arab — Levantine': ['Lebanese', 'Syrian', 'Jordanian', 'Palestinian', 'Iraqi', 'Other Levantine'],
  'Arab — Gulf': ['Saudi', 'Emirati', 'Kuwaiti', 'Qatari', 'Bahraini', 'Omani', 'Yemeni', 'Other Gulf'],
  'Arab — North African': ['Egyptian', 'Moroccan', 'Algerian', 'Tunisian', 'Libyan', 'Sudanese', 'Other North African'],
  'Persian / Iranian': ['Persian', 'Azeri', 'Kurdish', 'Balochi', 'Other Iranian'],
  'Turkish': ['Turkish', 'Azerbaijani', 'Turkmen', 'Other Turkic'],
  'East African': ['Somali', 'Ethiopian', 'Eritrean', 'Kenyan', 'Tanzanian', 'Ugandan', 'Other East African'],
  'South-East Asian': ['Indonesian', 'Malaysian', 'Filipino', 'Thai', 'Vietnamese', 'Singaporean', 'Other South-East Asian'],
  'European': ['British', 'French', 'German', 'Spanish', 'Italian', 'Other European'],
  'North American': ['American', 'Canadian', 'Other North American'],
};

export const COUNTRIES = [
  'USA', 'Canada', 'United Kingdom', 'Germany', 'France', 'Netherlands',
  'Sweden', 'Norway', 'Australia', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait',
  'Pakistan', 'India', 'Iran', 'Iraq', 'Lebanon', 'Turkey', 'Tanzania',
  'Kenya', 'Other'
];

export const HEIGHT_OPTIONS = [
  "4'10\" (147cm)", "5'0\" (152cm)", "5'2\" (157cm)", "5'4\" (163cm)",
  "5'6\" (168cm)", "5'8\" (173cm)", "5'10\" (178cm)", "6'0\" (183cm)",
  "6'2\" (188cm)", "6'4\" (193cm)"
];

// ── Profile completeness scoring (used by wizard, dashboard, and badges) ────
const SCORED_FIELDS = [
  'displayName', 'gender', 'seekingGender', 'age', 'city', 'country', 'height',
  'sect', 'religiosity', 'prayer', 'marja', 'diet',
  'syedStatus', 'ethnicity', 'languages', 'citizenships',
  'educationLevel', 'profession',
  'timeline', 'relocation', 'familyInvolvement',
  'photoAccess', 'profileVisibility', 'managementMode',
  'bio', 'lookingFor',
  // Profile depth (2026-11-10): the new detail fields and partner
  // preferences count toward completeness alongside the old ones.
  'educationField', 'educationInstitution', 'employer', 'residencyStatus',
  'build', 'hobbies', 'convertStatus',
  'prefAgeMin', 'prefAgeMax', 'prefHeightMinCm', 'prefHeightMaxCm',
  'prefEducation', 'prefLocation', 'prefMustHaves',
];

export function computeProfileCompleteness(data = {}) {
  const filled = SCORED_FIELDS.filter(f => {
    const v = data[f];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }).length;
  return Math.round((filled / SCORED_FIELDS.length) * 100);
}

// Wizard step registry (single source of truth for progress UI + validation)
export const ONBOARDING_STEPS = [
  { id: 1, title: 'About you', subtitle: 'The essentials' },
  { id: 2, title: 'Faith & practice', subtitle: 'Your deen, your way' },
  { id: 3, title: 'Background & lineage', subtitle: 'Heritage & identity' },
  { id: 4, title: 'Education & career', subtitle: 'Work & study' },
  { id: 5, title: 'Marriage intentions', subtitle: 'Timeline & family' },
  { id: 6, title: 'Privacy & photos', subtitle: 'You control everything' },
  { id: 7, title: 'Review & publish', subtitle: 'Final check' }
];