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
  { value: 'cultural', label: 'Culturally connected', desc: 'Identity & heritage are my focus right now' }
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
  'No restrictions'
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

// Photo privacy — the platform's signature control
export const PHOTO_ACCESS_OPTIONS = [
  { value: 'public', label: 'Visible to all members', desc: 'Any signed-in member can view your photos', icon: 'globe' },
  { value: 'request', label: 'Request only', desc: 'Members must send a photo request you approve', icon: 'key' },
  { value: 'match', label: 'Blurred until match', desc: 'Photos unblur only after a mutual match', icon: 'lock' }
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

export const EDUCATION_OPTIONS = [
  'High school',
  'Some college',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate (PhD / MD / JD)',
  'Islamic seminary (Hawza)',
  'Vocational / Trade'
];

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
  'bio', 'lookingFor'
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