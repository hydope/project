// Programmatic SEO landing pages — 11 tag phrases × every profile city/country.
// Each tag type has a distinct content angle; each place injects its own
// context (city vs country, region). Generated pages merge with the
// hand-written LANDING_PAGES (hand-written wins on slug conflicts).
//
// The 11 tags (from Syed's "Popular searches" spec):
//   Shia Rishta in {place}, Shia Rishtay in {place}, Shia Nikah in {place},
//   Shia Marriage in {place}, Shia Matrimony in {place}, {place} Shia Brides,
//   {place} Shia Grooms, Shia Shaadi in {place}, Find Shia Rishta {place},
//   {place} Shia Matrimonial, Shia Nikah Match {place}

// ── Places: every city + country present in member profiles ────────────────
export const TAG_PLACES = [
  // Cities
  { slug: 'karachi', name: 'Karachi', type: 'city', country: 'Pakistan', region: 'South Asia' },
  { slug: 'lahore', name: 'Lahore', type: 'city', country: 'Pakistan', region: 'South Asia' },
  { slug: 'sargodha', name: 'Sargodha', type: 'city', country: 'Pakistan', region: 'South Asia' },
  { slug: 'mumbai', name: 'Mumbai', type: 'city', country: 'India', region: 'South Asia' },
  { slug: 'chennai', name: 'Chennai', type: 'city', country: 'India', region: 'South Asia' },
  { slug: 'bangalore', name: 'Bangalore', type: 'city', country: 'India', region: 'South Asia' },
  { slug: 'dubai', name: 'Dubai', type: 'city', country: 'UAE', region: 'the Gulf' },
  { slug: 'abu-dhabi', name: 'Abu Dhabi', type: 'city', country: 'UAE', region: 'the Gulf' },
  { slug: 'toronto', name: 'Toronto', type: 'city', country: 'Canada', region: 'North America' },
  { slug: 'london', name: 'London', type: 'city', country: 'the United Kingdom', region: 'Europe' },
  { slug: 'chicago', name: 'Chicago', type: 'city', country: 'the USA', region: 'North America' },
  { slug: 'houston', name: 'Houston', type: 'city', country: 'the USA', region: 'North America' },
  { slug: 'washington-dc', name: 'Washington DC', type: 'city', country: 'the USA', region: 'North America' },
  { slug: 'silver-spring', name: 'Silver Spring', type: 'city', country: 'the USA', region: 'North America' },
  { slug: 'sydney', name: 'Sydney', type: 'city', country: 'Australia', region: 'Oceania' },
  { slug: 'nanjing', name: 'Nanjing', type: 'city', country: 'China', region: 'East Asia' },
  // Countries
  { slug: 'pakistan', name: 'Pakistan', type: 'country', region: 'South Asia' },
  { slug: 'india', name: 'India', type: 'country', region: 'South Asia' },
  { slug: 'uae', name: 'UAE', type: 'country', region: 'the Gulf' },
  { slug: 'canada', name: 'Canada', type: 'country', region: 'North America' },
  { slug: 'usa', name: 'USA', type: 'country', region: 'North America' },
  { slug: 'united-kingdom', name: 'United Kingdom', type: 'country', region: 'Europe' },
  { slug: 'australia', name: 'Australia', type: 'country', region: 'Oceania' },
];

// ── The 11 tag templates ───────────────────────────────────────────────────
// Each has: slug pattern, title/h1 builders, and a distinct content angle.
const TAG_DEFS = [
  {
    id: 'rishta',
    slug: p => `shia-rishta-${p.slug}`,
    phrase: p => `Shia Rishta in ${p.name}`,
    h1: p => `Shia Rishta in ${p.name}`,
    title: p => `Shia Rishta in ${p.name} | Find Verified Shia Profiles – Shia Rishta`,
    desc: p => `Find a Shia rishta in ${p.name}. Verified profiles, wali-involved introductions, and photo privacy — the nikah-first platform. Join free.`,
    angle: 'search',
  },
  {
    id: 'rishtay',
    slug: p => `shia-rishtay-${p.slug}`,
    phrase: p => `Shia Rishtay in ${p.name}`,
    h1: p => `Shia Rishtay in ${p.name}`,
    title: p => `Shia Rishtay in ${p.name} | Shia Rishta Profiles – Shia Rishta`,
    desc: p => `Shia rishtay in ${p.name} — browse verified Shia profiles seeking nikah, with family involvement from the start. Free to join.`,
    angle: 'search-urdu',
  },
  {
    id: 'nikah',
    slug: p => `shia-nikah-${p.slug}`,
    phrase: p => `Shia Nikah in ${p.name}`,
    h1: p => `Shia Nikah in ${p.name}`,
    title: p => `Shia Nikah in ${p.name} | Nikah-First Matchmaking – Shia Rishta`,
    desc: p => `Seeking nikah in ${p.name}? Meet verified Shia singles on a nikah-first platform — no casual dating, just serious marriage intent. Join free.`,
    angle: 'nikah',
  },
  {
    id: 'marriage',
    slug: p => `shia-marriage-${p.slug}`,
    phrase: p => `Shia Marriage in ${p.name}`,
    h1: p => `Shia Marriage in ${p.name}`,
    title: p => `Shia Marriage in ${p.name} | Find Your Life Partner – Shia Rishta`,
    desc: p => `Shia marriage in ${p.name} starts with the right introduction. Verified profiles, family involvement, and privacy-first matchmaking. Join free.`,
    angle: 'marriage',
  },
  {
    id: 'matrimony',
    slug: p => `shia-matrimony-${p.slug}`,
    phrase: p => `Shia Matrimony in ${p.name}`,
    h1: p => `Shia Matrimony in ${p.name}`,
    title: p => `Shia Matrimony in ${p.name} | Trusted Matchmaking – Shia Rishta`,
    desc: p => `Shia matrimony in ${p.name} — a trusted platform with verified profiles, marja-aware filters, and wali workflows. Join free.`,
    angle: 'matrimony',
  },
  {
    id: 'brides',
    slug: p => `${p.slug}-shia-brides`,
    phrase: p => `${p.name} Shia Brides`,
    h1: p => `${p.name} Shia Brides`,
    title: p => `${p.name} Shia Brides | Verified Profiles Seeking Nikah – Shia Rishta`,
    desc: p => `Meet ${p.name} Shia brides seeking nikah. Verified profiles, photo privacy she controls, and wali-involved introductions. Browse free.`,
    angle: 'brides',
  },
  {
    id: 'grooms',
    slug: p => `${p.slug}-shia-grooms`,
    phrase: p => `${p.name} Shia Grooms`,
    h1: p => `${p.name} Shia Grooms`,
    title: p => `${p.name} Shia Grooms | Verified Profiles Seeking Nikah – Shia Rishta`,
    desc: p => `Meet ${p.name} Shia grooms seeking nikah. Verified profiles, clear intentions, and family-to-family introductions. Browse free.`,
    angle: 'grooms',
  },
  {
    id: 'shaadi',
    slug: p => `shia-shaadi-${p.slug}`,
    phrase: p => `Shia Shaadi in ${p.name}`,
    h1: p => `Shia Shaadi in ${p.name}`,
    title: p => `Shia Shaadi in ${p.name} | Find Your Match – Shia Rishta`,
    desc: p => `Shia shaadi in ${p.name} — find a compatible match with verified profiles and family involvement. The modern way to arrange a blessed shaadi. Join free.`,
    angle: 'shaadi',
  },
  {
    id: 'find',
    slug: p => `find-shia-rishta-${p.slug}`,
    phrase: p => `Find Shia Rishta ${p.name}`,
    h1: p => `Find Shia Rishta in ${p.name}`,
    title: p => `Find Shia Rishta in ${p.name} | Start Today – Shia Rishta`,
    desc: p => `Find a Shia rishta in ${p.name} today. Create a free profile, browse verified matches, and involve your family from day one.`,
    angle: 'find',
  },
  {
    id: 'matrimonial',
    slug: p => `${p.slug}-shia-matrimonial`,
    phrase: p => `${p.name} Shia Matrimonial`,
    h1: p => `${p.name} Shia Matrimonial`,
    title: p => `${p.name} Shia Matrimonial | Profiles & Matchmaking – Shia Rishta`,
    desc: p => `${p.name} Shia matrimonial — profiles, matchmaking, and wali workflows built for Shia families. Verified and free to join.`,
    angle: 'matrimonial',
  },
  {
    id: 'nikah-match',
    slug: p => `shia-nikah-match-${p.slug}`,
    phrase: p => `Shia Nikah Match ${p.name}`,
    h1: p => `Shia Nikah Match in ${p.name}`,
    title: p => `Shia Nikah Match in ${p.name} | Compatible Matches – Shia Rishta`,
    desc: p => `Your Shia nikah match in ${p.name} — compatibility on marja, practice, and family values, not just photos. Find your match free.`,
    angle: 'match',
  },
  {
    id: 'shia-match',
    slug: p => `shia-match-${p.slug}`,
    phrase: p => `Shia Match ${p.name}`,
    h1: p => `Shia Match in ${p.name}`,
    title: p => `Shia Match in ${p.name} | Find Your Shia Match – Shia Rishta`,
    desc: p => `Find your Shia match in ${p.name}. Verified Shia singles seeking nikah, matched on deen and values. Join free and meet your match.`,
    angle: 'shia-match',
  },
];

// ── Content builders: distinct angle per tag type ──────────────────────────
function inPhrase(place) {
  return place.type === 'city' ? `in ${place.name}` : `in ${place.name}`;
}
function placeContext(place) {
  if (place.type === 'city') return `${place.name}, ${place.country}`;
  return place.name;
}

const ANGLES = {
  'search': {
    intro: p => [
      `Searching for a Shia rishta ${inPhrase(p)} means looking in the right place. Shia Rishta is the nikah-first platform where every profile is Shia — filter by marja, sect, practice, and family values to find genuinely compatible matches ${inPhrase(p)}.`,
      `Whether your family is in ${placeContext(p)} or you're searching from elsewhere for someone there, the platform keeps the process dignified: verified profiles, photo privacy you control, and your wali involved from the first introduction.`,
    ],
    sections: p => [
      { h2: `Why search ${inPhrase(p)} on Shia Rishta`, body: [`Generic matrimonial sites treat "Muslim" as one checkbox. But a Shia family ${inPhrase(p)} needs marja compatibility, Muharram observance alignment, and family structures built around nikah — filters Shia Rishta was designed around from day one.`] },
      { h2: 'How it works', body: [`Create a free profile with honest detail about your practice and expectations. Browse verified profiles ${inPhrase(p)}, express interest where there is genuine alignment, and bring your wali in early — the strongest matches are the ones where families were involved from the start.`] },
    ],
    faqs: p => [
      { q: `Is Shia Rishta free ${inPhrase(p)}?`, a: 'Yes. Joining, creating a profile, browsing, messaging, and verification are all free — everywhere.' },
      { q: `How do I know profiles ${inPhrase(p)} are genuine?`, a: 'Profiles go through identity and marriage-intention checks, and photo privacy tiers mean members reveal themselves gradually to serious prospects only.' },
    ],
  },
  'search-urdu': {
    intro: p => [
      `Ap ${placeContext(p)} mein Shia rishtay talash kar rahe hain? Shia Rishta par har profile Shia hai — marja, maslak, aur deeni mizaaj ke hisaab se filter karein aur ${inPhrase(p)} apne liye munasib rishta payein.`,
      `Searching for Shia rishtay ${inPhrase(p)} works best on a platform built for it: verified profiles, family involvement from the start, and complete photo privacy — join free and begin today.`,
    ],
    sections: p => [
      { h2: `Rishtay ${inPhrase(p)} — with dignity`, body: [`Rishta hunting through relatives and WhatsApp forwards ${inPhrase(p)} is exhausting and often fruitless. Shia Rishta brings the process online without losing what matters: wali involvement, family-to-family communication, and profiles created with nikah as the stated purpose.`] },
      { h2: 'Shuruwat kaise karein', body: [`Muft profile banayein, apni deeni aur khandani tawakkoat saaf likhein, ${inPhrase(p)} verified profiles dekhein, aur jahan dil mile wahan izzat se rabta karein. Wali ko shuru se shamil rakhein — yahi tareeqa sab se kamyab hai.`] },
    ],
    faqs: p => [
      { q: `Kya Shia Rishta ${inPhrase(p)} muft hai?`, a: 'Jee haan. Profile, browsing, messaging aur verification — sab kuch muft hai.' },
      { q: `Are profiles ${inPhrase(p)} verified?`, a: 'Yes — identity and marriage-intention checks run before sensitive access opens.' },
    ],
  },
  'nikah': {
    intro: p => [
      `If your goal is nikah ${inPhrase(p)} — not dating, not "seeing where it goes" — you need a platform where everyone else wants the same thing. Shia Rishta is nikah-first: every profile states marriage intent, and the process is built around families, not swipes.`,
      `Members ${inPhrase(p)} use Shia Rishta to find a spouse with compatible deen, marja, and family values — then involve both families early, the way nikah is meant to happen.`,
    ],
    sections: p => [
      { h2: `Nikah-first, ${inPhrase(p)}`, body: [`Casual dating apps waste the time of people seeking nikah. Here, intention is stated upfront: profiles describe practice, family expectations, and timeline honestly, so conversations ${inPhrase(p)} start from seriousness, not small talk.`] },
      { h2: 'From introduction to nikah', body: [`Express interest, talk with mutual respect, involve your wali early, and let families meet when both sides are serious. The platform supports each step — private messaging, guardian approvals, and family-to-family communication — until nikah.`] },
    ],
    faqs: p => [
      { q: `Is this only for people seeking nikah ${inPhrase(p)}?`, a: 'Yes. Every profile is created with marriage as its stated purpose — there is no casual dating on the platform.' },
      { q: 'How long does the process take?', a: 'It varies, but members who involve their families early and state expectations clearly tend to find serious matches fastest.' },
    ],
  },
  'marriage': {
    intro: p => [
      `A Shia marriage ${inPhrase(p)} begins long before the nikah khutbah — it begins with finding the right person. Shia Rishta helps you find a spouse ${inPhrase(p)} whose deen, marja, and family values align with yours, so the marriage starts on solid ground.`,
      `Browse verified profiles ${inPhrase(p)}, filter by what actually decides compatibility, and build the relationship with family involvement from the start — because the strongest marriages are family-supported marriages.`,
    ],
    sections: p => [
      { h2: `What makes a strong Shia marriage ${inPhrase(p)}`, body: [`Shared marja, compatible practice, aligned family expectations, and honest communication. Shia Rishta filters on exactly these — so you meet people ${inPhrase(p)} with whom a lasting marriage is actually plausible, not just a pleasant conversation.`] },
      { h2: 'Build it right', body: [`Start with a complete, honest profile. Look for the same in others. Involve your wali early. Meet families before feelings outrun judgment. The platform is designed around this sequence because it works.`] },
    ],
    faqs: p => [
      { q: `Can I find a marriage partner ${inPhrase(p)} here?`, a: 'Yes — that is the platform\u2019s entire purpose. Every member is seeking marriage.' },
      { q: 'Do families get involved?', a: 'They should, and the platform makes it easy: wali connections, guardian approvals, and family-to-family messaging are built in.' },
    ],
  },
  'matrimony': {
    intro: p => [
      `Shia matrimony ${inPhrase(p)} deserves better than generic "Muslim matrimonial" sites that don't understand marja, sect, or Muharram. Shia Rishta is the matrimony platform built exclusively for Shia families — with the filters, privacy, and wali workflows that Shia matchmaking actually requires.`,
      `Members ${inPhrase(p)} create detailed matrimonial profiles covering deen, education, family background, and expectations — then connect through a process their families can trust.`,
    ],
    sections: p => [
      { h2: `Matrimony ${inPhrase(p)}, done properly`, body: [`A proper Shia matrimonial process ${inPhrase(p)} means: verified identities, marja-aware matching, photo privacy the member controls, and wali involvement from the first introduction. Shia Rishta implements all four — free.`] },
      { h2: 'For parents and guardians', body: [`If you are a parent searching ${inPhrase(p)} for your son or daughter: create a guardian-linked profile, review introductions together, and communicate family-to-family. The platform respects the traditional process while making it vastly more efficient.`] },
    ],
    faqs: p => [
      { q: `Is this a Shia-only matrimony service ${inPhrase(p)}?`, a: 'Yes. Every profile on the platform is Shia — that is the founding premise.' },
      { q: 'What does it cost?', a: 'Nothing. Joining, profiles, browsing, messaging, and verification are free.' },
    ],
  },
  'brides': {
    intro: p => [
      `Searching for a Shia bride ${inPhrase(p)}? Meet verified Shia women seriously seeking nikah — with profiles that show deen, education, family values, and expectations honestly, so you can shortlist with confidence.`,
      `Every bride ${inPhrase(p)} controls her photo privacy, her wali can be involved from the first introduction, and conversations begin only on mutual interest — dignity for her, clarity for you.`,
    ],
    sections: p => [
      { h2: `What to look for in ${placeContext(p)}`, body: [`Beyond the profile, look for consistency: does her description of practice match her daily life? Is her family involved early? Are expectations stated clearly? The clearest profiles ${inPhrase(p)} — honest about deen, family, and hopes — lead to the most serious conversations.`] },
      { h2: 'Approach with respect', body: [`Bring your own clarity: a complete profile from the groom\u2019s side, with family details and wali readiness, is what serious brides ${inPhrase(p)} and their families respond to first. Express interest, wait for mutuality, then let families talk.`] },
    ],
    faqs: p => [
      { q: `Are brides ${inPhrase(p)} verified?`, a: 'Yes — identity and marriage-intention checks run before sensitive access opens.' },
      { q: 'Who sees her photos?', a: 'She decides: everyone, only after mutual interest, or only after matching — changeable at any time.' },
    ],
  },
  'grooms': {
    intro: p => [
      `Searching for a Shia groom ${inPhrase(p)}? Meet verified Shia men seriously seeking nikah — with clear intentions, stated expectations, and family backgrounds you can evaluate properly.`,
      `Grooms ${inPhrase(p)} on Shia Rishta create detailed profiles: practice, profession, family, timeline. Filter by what matters to your family, then begin with a respectful, wali-involved introduction.`,
    ],
    sections: p => [
      { h2: `What to look for in ${placeContext(p)}`, body: [`Look for clarity about deen and practice, a stated timeline, and willingness to involve families early. The most serious grooms ${inPhrase(p)} write complete profiles and welcome wali involvement — evasiveness about either is a signal worth noting.`] },
      { h2: 'How introductions work', body: [`Express interest where there is genuine alignment. When it is mutual, begin talking — and bring your wali in early. Family-to-family communication ${inPhrase(p)} is built into the platform because that is how Shia marriages are properly arranged.`] },
    ],
    faqs: p => [
      { q: `Are grooms ${inPhrase(p)} verified?`, a: 'Yes — identity and marriage-intention checks run before sensitive access opens.' },
      { q: 'Can my wali review introductions?', a: 'Yes. Connect your wali or guardian to review introductions and approve next steps.' },
    ],
  },
  'shaadi': {
    intro: p => [
      `Planning a Shia shaadi ${inPhrase(p)} starts with finding the right match. Shia Rishta helps families ${inPhrase(p)} find compatible Shia partners — verified, serious about nikah, and ready to involve both families.`,
      `From first introduction to the shaadi itself, the platform keeps the process organized: private messaging, guardian approvals, and family-to-family communication, all in one place.`,
    ],
    sections: p => [
      { h2: `The road to shaadi ${inPhrase(p)}`, body: [`A blessed shaadi ${inPhrase(p)} begins with the right niyyah and the right introduction. Create your profile, search verified matches, talk with mutual respect, involve families early — and when both sides are certain, plan the nikah with everyone\u2019s duas.`] },
      { h2: 'Why families choose Shia Rishta', body: [`Because it respects the process: no public exposure of your search, photo privacy you control, wali workflows that work across distances, and a community ${inPhrase(p)} that shares your values. Shaadi is a family event — the search for a partner should honor that.`] },
    ],
    faqs: p => [
      { q: `Can our whole family use it for the shaadi search ${inPhrase(p)}?`, a: 'Yes — guardian-linked profiles let parents and walis participate directly in the search and review introductions.' },
      { q: 'Is it free?', a: 'Completely. Profiles, browsing, messaging, and verification cost nothing.' },
    ],
  },
  'find': {
    intro: p => [
      `Ready to find a Shia rishta ${inPhrase(p)}? Start here: create a free profile in minutes, tell us what matters — marja, practice, family values, location — and browse verified Shia profiles ${inPhrase(p)} seeking nikah.`,
      `No endless scrolling through incompatible profiles. No explaining your marja to people who have never heard of it. Just a focused search ${inPhrase(p)} among people who share your deen and your goal.`,
    ],
    sections: p => [
      { h2: `Your search ${inPhrase(p)}, step by step`, body: [`1. Create your free profile with honest detail. 2. Set filters: location ${inPhrase(p)}, marja, practice, age, education. 3. Browse verified matches and express interest. 4. Talk, involve your wali, and let families meet. Most members ${inPhrase(p)} find serious conversations within weeks of a complete profile.`] },
      { h2: 'Make your profile work', body: [`Complete profiles get 5× more serious interest: a clear photo (or photo-privacy setting), honest practice description, family background, and stated expectations. Write like you are introducing yourself to a respected elder — because you are.`] },
    ],
    faqs: p => [
      { q: `How fast can I find a rishta ${inPhrase(p)}?`, a: 'Members with complete profiles and early family involvement typically find serious matches within weeks to a few months.' },
      { q: 'What does "verified" mean?', a: 'Identity and marriage-intention checks before sensitive access opens — so you talk to real people seeking nikah.' },
    ],
  },
  'matrimonial': {
    intro: p => [
      `${placeContext(p)} Shia matrimonial — profiles, matchmaking, and marriage services for Shia families, all in one nikah-first platform. Verified members, marja-aware filters, and wali workflows designed for how Shia marriages actually happen.`,
      `Whether you are the one marrying or a parent searching for your child, the matrimonial process ${inPhrase(p)} is fully supported: detailed profiles, family involvement tools, and privacy controls throughout.`,
    ],
    sections: p => [
      { h2: `Matrimonial services ${inPhrase(p)}`, body: [`Profile creation with Shia-specific fields (marja, sect, practice level). Verified member directory ${inPhrase(p)}. Interest and introduction system with mutual consent. Wali and guardian participation. Family-to-family messaging. Biodata maker for sharing profiles offline. All free.`] },
      { h2: 'Built for Shia families', body: [`Unlike generic matrimonial sites, every filter, field, and workflow here understands Shia practice — because the platform serves only Shia families ${inPhrase(p)} and everywhere else.`] },
    ],
    faqs: p => [
      { q: `Is this matrimonial service really free ${inPhrase(p)}?`, a: 'Yes — joining, profiles, browsing, messaging, verification, and the biodata maker are all free.' },
      { q: 'Can parents create profiles for their children?', a: 'Yes — guardian-linked profiles are a core feature, with the member\u2019s consent and participation.' },
    ],
  },
  'match': {
    intro: p => [
      `Your Shia nikah match ${inPhrase(p)} is someone compatible on what actually matters: marja, practice, family values, life goals. Shia Rishta matches on compatibility — not just photos — so introductions ${inPhrase(p)} start from genuine alignment.`,
      `Create your profile, set what matters to you, and discover matches ${inPhrase(p)} ranked by real compatibility. Then let the conversation — and your families — take it from there.`,
    ],
    sections: p => [
      { h2: `How matching works ${inPhrase(p)}`, body: [`Compatibility considers marja, sect, practice level, prayer, family involvement preferences, location ${inPhrase(p)}, education, and timeline. The more honest your profile, the better your matches — the system can only work with what you tell it.`] },
      { h2: 'From match to nikah', body: [`A good match ${inPhrase(p)} is the beginning, not the end: talk with respect, verify alignment in conversation, involve your wali early, and bring families together when both sides are serious. The platform guides each step.`] },
    ],
    faqs: p => [
      { q: `How are matches ${inPhrase(p)} ranked?`, a: 'By compatibility across marja, practice, family values, location, and stated expectations — not by photo popularity.' },
      { q: 'What if I don\u2019t find a match immediately?', a: 'New verified profiles join daily. Keep your profile complete and check back — and consider widening location filters.' },
    ],
  },
  'shia-match': {
    intro: p => [
      `Looking for your Shia match ${inPhrase(p)}? You are in the right place. Shia Rishta connects Shia singles ${inPhrase(p)} who are serious about nikah — verified profiles, honest intentions, and families involved from the start.`,
      `A true Shia match ${inPhrase(p)} shares more than a city: shared marja, compatible practice, aligned family values. That is what the platform matches on — so every introduction ${inPhrase(p)} has real potential.`,
    ],
    sections: p => [
      { h2: `Find your Shia match ${inPhrase(p)}`, body: [`Start with a free profile that says who you are: your deen, your practice, your family, your hopes. Then browse verified Shia singles ${inPhrase(p)}, filter by marja and values, and reach out where there is genuine compatibility. Your match ${inPhrase(p)} is here — the platform just makes the introduction dignified.`] },
      { h2: 'Why Shia Rishta for your match', body: [`Because a Shia match needs Shia filters: marja, sect, Muharram observance, wali workflows. Generic platforms cannot do this. Here, every member ${inPhrase(p)} is Shia and seeking nikah — so you never waste time explaining the basics to someone who does not share them.`] },
    ],
    faqs: p => [
      { q: `How do I find my Shia match ${inPhrase(p)}?`, a: 'Create a free profile, set your filters for location, marja, and practice, then browse verified profiles and express interest where there is alignment.' },
      { q: 'Is finding a match free?', a: 'Yes — profiles, browsing, matching, messaging, and verification are all free.' },
    ],
  },
};

// ── All 11 tags, rendered on every page ("Popular searches") ───────────────
function allTags(place) {
  return TAG_DEFS.map(t => ({ label: t.phrase(place), to: `/${t.slug(place)}` }));
}

// ── Page builder ───────────────────────────────────────────────────────────
function buildPage(tag, place) {
  const slug = tag.slug(place);
  const angle = ANGLES[tag.angle];
  const tags = allTags(place);
  // Related: other tag variants for the same place + same tag in other places
  const related = [
    ...TAG_DEFS.filter(t => t.id !== tag.id).slice(0, 4).map(t => ({
      to: `/${t.slug(place)}`,
      label: t.phrase(place),
    })),
    ...TAG_PLACES.filter(p => p.slug !== place.slug).slice(0, 3).map(p => ({
      to: `/${tag.slug(p)}`,
      label: tag.phrase(p),
    })),
  ];
  return {
    title: tag.title(place),
    desc: tag.desc(place),
    h1: tag.h1(place),
    breadcrumb: tag.phrase(place),
    intro: angle.intro(place),
    sections: angle.sections(place),
    faqs: angle.faqs(place),
    related,
    popularTags: tags,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────
// slug → page data. Hand-written LANDING_PAGES entries take precedence
// (merged at the LandingPage component level).
export function buildTagLandingPages() {
  const pages = {};
  for (const place of TAG_PLACES) {
    for (const tag of TAG_DEFS) {
      const slug = tag.slug(place);
      pages[slug] = buildPage(tag, place);
    }
  }
  return pages;
}

export function tagLandingSlugs() {
  const slugs = [];
  for (const place of TAG_PLACES) {
    for (const tag of TAG_DEFS) {
      slugs.push(tag.slug(place));
    }
  }
  return slugs;
}

export const TAG_LANDING_COUNT = TAG_PLACES.length * TAG_DEFS.length;

// ── Prerender SEO: same shape as landingRouteSeo() output ───────────────────
// Used by scripts/prerender-routes.mjs so every generated page gets a unique
// title, description, H1, and body copy in its static HTML.
export function tagLandingSeo() {
  const pages = buildTagLandingPages();
  const out = {};
  for (const [slug, page] of Object.entries(pages)) {
    out['/' + slug] = {
      title: page.title,
      desc: page.desc,
      h1: page.h1,
      lede: page.intro[0] || page.desc,
      sections: [
        ...page.intro.slice(1).map(p => ({ h2: page.h1, p: [p] })),
        ...page.sections.map(s => ({ h2: s.h2, p: s.body })),
      ],
      faq: page.faqs.map(f => ({ q: f.q, a: f.a })),
    };
  }
  return out;
}
