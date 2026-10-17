// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for per-route SEO.
//
// Consumed by TWO consumers that must never disagree:
//
//   1. src/components/Seo.jsx — sets document.title, meta description,
//      canonical and robots on every client-side navigation.
//   2. scripts/prerender-routes.mjs — generates a static index.html per route
//      at build time so a crawler that never executes JavaScript receives the
//      CORRECT page instead of the homepage's H1 and title.
//
// The table used to live only inside Seo.jsx. The build step then had no way to
// learn the per-route copy, so every route served one identical document — the
// homepage's H1 on /privacy, which is worse than no static HTML at all because
// it tells a crawler the wrong thing confidently. A second hand-copied table
// would drift the first time a title changed, so there is one table.
//
// `body` is the no-JS content: real copy matching the live page. No testimonials
// and no member counts appear anywhere in this file. A build-time artifact
// cannot know either, and inventing them is precisely what this project refuses
// to do — the live figures come from /api/profiles/stats at runtime.
// ─────────────────────────────────────────────────────────────────────────────

export const SHARED_NAV = [
  { href: '/profiles', label: 'Browse profiles' },
  // The location hub. Without it in the nav, every /city/* and /country/* page
  // was an orphan — in the sitemap with unique metadata, and linked from nothing.
  { href: '/locations', label: 'By location' },
  { href: '/about', label: 'About' },
  { href: '/safety', label: 'Safety' },
  { href: '/success-stories', label: 'How it works' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/auth/register', label: 'Create free account' },
];

export const ROUTE_SEO = {
  '/': {
    title: 'Shia Matrimony | Find Shia Rishta for Nikah – Shia Rishta',
    desc: 'Nikah-first Shia matrimony. Browse profiles, keep photos private, involve family with wali and guardian tools. Free to join.',
    h1: 'Shia Rishta — nikah-first Shia matrimony',
    // Emitted as FAQPage structured data by the prerenderer.
    //
    // This is NOT social proof: these are questions the site already answers in
    // its own on-page copy below, restated in schema.org form so an answer
    // engine can read them without inferring them. Every answer here matches
    // visible text on the page, which is what Google requires — inventing
    // questions nobody on the page answers would be both useless and a policy
    // risk.
    faq: [
      { q: 'Is Shia Rishta really free?', a: 'Yes. Creating a profile, browsing, expressing interest and using guardian tools are all free, and core access is intended to stay free.' },
      { q: 'Who can see my photos?', a: 'Only the people you choose: everyone, people you have mutual interest with, or only your matches. The default is the most private of those.' },
      { q: 'Can my family or wali be involved?', a: 'Yes. Wali and guardian workflows are first-class: approvals, family introductions and chaperoned communication. A member can revoke a guardian link permanently at any time.' },
      { q: 'Who can join Shia Rishta?', a: 'Serious Shia Muslims seeking nikah, along with parents, guardians and trusted matchmakers acting on their behalf.' },
      { q: 'When can I start a conversation?', a: 'Only after interest is mutual. Nobody is notified of an unreciprocated approach, which removes the most common harassment vector on dating platforms.' },
      { q: 'What is the difference from a generic dating app?', a: 'It is Shia-specific (sect, marja and practice fields that generic sites do not carry), privacy-first (photo tiers instead of a public gallery) and nikah-first (no swiping culture).' },
    ],
    lede: 'Shia Rishta is a matchmaking platform built for Shia Muslims seeking nikah, and for the families and walis who support them. Every profile is created with marriage intent. Photos stay private by default, conversations require mutual interest, and family involvement is part of the journey rather than an afterthought.',
    price: true,
    sections: [
      {
        h2: 'Privacy by design',
        p: 'Your contact details are never published. A member chooses exactly who sees their photos: everyone, only after mutual interest, or only after matching. Blocking is instant, and revoking a wali or guardian link takes effect immediately.',
      },
      {
        h2: 'Family and wali workflows',
        p: 'In Shia fiqh a virgin woman’s nikah requires her wali’s consent, so guardian approvals, family-to-family introductions and chaperoned communication are built in from the start. A member can delegate profile management to a parent, guardian or trusted matchmaker.',
      },
      {
        h2: 'What makes this different from a generic matrimonial site',
        p: [
          'Most matrimonial sites take a generic profile form and add a sect dropdown as an afterthought, which leaves families doing the real filtering themselves in the messages. Shia Rishta treats the things a Shia family actually decides on as structured data. Sect and marja are separate fields. Religiosity and prayer practice are their own field rather than a sentence in a biography. Niyaz and syed status are searchable. A family can narrow a large list down to a genuinely plausible shortlist before anyone sends a message.',
          'Privacy works the same way. A generic site shows a photo gallery, because photos are what make a profile feel alive. Here a photo is the most dangerous thing a profile can carry, so every member chooses one of three tiers: visible to everyone, visible only after mutual interest, or visible only to matches. The default is the most restrictive. That is a deliberate inversion of the usual default, and it is the single most common reason a family chooses a privacy-first platform over a gallery-driven one.',
          'Messaging is gated on mutual interest, too. On most platforms, sending one message is enough to open an inbox that anyone can fill with messages you never asked for. Here interest has to be mutual before a conversation can start at all, so nobody is ever notified that they were approached and did not reciprocate. That removes the single most common route to harassment on a dating platform.',
        ],
      },
      {
        h2: 'How it works',
        steps: [
          { h3: '1. Create a profile with your intent', p: 'Set your marriage goals, religious practice, family background and timeline, plus the sect and marja filters that generic matrimonial sites do not carry. Write what you are looking for plainly: families read dozens of profiles and they can tell within a sentence whether one is serious.' },
          { h3: '2. Browse and express interest privately', p: 'Search by sect, city, age and practice. Interest is one-sided until it is mutual, so nobody is notified of an unreciprocated approach. Nothing you send is visible to anyone who has not sent something back.' },
          { h3: '3. Talk once you both agree', p: 'A conversation opens only after mutual interest. Contact exchange and photo unlocks require agreement from both sides. If either person revokes a wali or guardian link at any point, access ends immediately and permanently.' },
        ],
      },
      {
        h2: 'Who this suits, and who it does not',
        // Array, not repeated `p:` keys. A second `p:` in the same object
        // silently overwrites the first — JS object literal duplicate keys — so
        // roughly 90 words of real copy were being discarded at prerender while
        // reading correctly in source. ESLint's no-dupe-keys caught it.
        p: [
          'This suits Shia Muslims who are genuinely seeking nikah, and families who want to be involved properly rather than discover afterwards that a match happened without them. It suits people who would rather exchange five considered messages with five plausible families than fifty messages with fifty strangers.',
          'It does not suit someone looking for casual conversation, an open-ended dating experience, or a fast-swiping feed. Those are legitimate things to want and they are simply not what this platform is for. Being clear about that is more useful to a visitor than a larger member list would be.',
        ],
      },
      {
        h2: 'How photo privacy works in practice',
        p: [
          'Every member picks one of three settings, and it applies everywhere without exception. "Everyone" shows photos to any signed-out visitor browsing the directory. "After mutual interest" keeps photos hidden until both people have expressed interest, so a photo is never visible to someone who has only looked. "Matches only" keeps photos hidden until you have actually been matched, which is the strictest option and the default for anyone who has not chosen otherwise.',
          'In every case the photos themselves stay behind an access check on the server. They are not delivered to the browser and hidden with CSS, which is the usual trick and the reason photos leak on most sites. A locked photo is never sent over the wire at all, so there is nothing in the page source, the network tab or a browser cache to recover.',
          'Changing a setting takes effect immediately, including mid-conversation. There is no delay, no grace period, and nobody is notified that it changed.',
        ],
      },
      {
        h2: 'Who can join',
        p: 'Serious Shia Muslims seeking nikah, along with parents, guardians and trusted matchmakers acting on their behalf. Identity and intention checks are reviewed before sensitive access opens.',
      },
      // The visible FAQ is rendered from the `faq` array above, so it is not
      // repeated here. Two copies of the same questions on one page is exactly
      // the duplicate-content pattern this work removed elsewhere.
      {
        h2: 'Contact',
        p: 'Questions, privacy requests or takedown requests go through our contact form, which reaches the operations team directly. Signed-in members can also raise a support request from their dashboard.',
      },
    ],
  },

  '/locations': {
    title: 'Shia Matrimony by City & Country | Shia Rishta',
    desc: 'Find Shia matrimonial profiles by city or country. Browse verified Shia rishta in Karachi, London, Toronto, Dubai and more. Free to browse.',
    h1: 'Shia matrimony by location',
    lede: 'Find Shia matrimonial profiles by city or country. Every location listed has members on Shia Rishta today, and each page links to live, filtered results.',
    sections: [
      { h2: 'Where are members?', p: 'This directory lists only locations that currently have at least one member. Nothing is listed speculatively: a city with no profiles does not get a page, because an empty location page is thin content rather than useful information.' },
      { h2: 'What happens when I open a city page?', p: 'Each city and country page links straight to live, filtered profiles for that place — real members you can express interest in, not a static list.' },
    ],
    faq: [
      { q: 'Why isn’t my city listed?', a: 'This directory lists only places that currently have at least one member. If your city isn’t here, nobody on the platform lives there yet — join free and you’ll be the first.' },
      { q: 'Can I search across the whole platform instead?', a: 'Yes. The full directory lets you filter by city, country, age, sect and more, whatever your location.' },
    ],
  },
  '/profiles': {
    title: 'Browse Shia Brides & Grooms for Nikah | Shia Rishta',
    desc: 'Search verified Shia profiles for nikah — filter by sect, marja, education and location. Serious Shia matrimony with privacy-first profiles. Join free.',
    h1: 'Browse Shia brides and grooms seeking nikah',
    lede: 'Search real Shia profiles by sect, marja, education, city and practice. Browsing is free and needs no account. Private profiles stay private, and photos follow each member’s own visibility setting.',
    sections: [
      { h2: 'How profiles are filtered', p: 'Narrow results by age, gender, sect, marja, religiosity, education and location. Filters are applied server-side, and the same rules apply whether or not you are signed in.' },
      { h2: 'Photo privacy on every profile', p: 'A member can show photos to everyone, only to people they have mutual interest with, or only to their matches. A locked photo stays locked until the owner decides otherwise.' },
      { h2: 'Your details stay yours', p: 'Contact details are never published. Blocking is instant and permanent, and revoking a wali or guardian link takes effect immediately.' },
    ],
  },

  '/privacy': {
    title: 'Privacy Policy | Shia Rishta',
    desc: 'How Shia Rishta collects, encrypts and protects your personal data. Your photos, contact details and guardian links stay under your control.',
    h1: 'Privacy Policy',
    lede: 'This policy explains what Shia Rishta collects, why, how it is protected, and what control you keep over it. It is written to be read, not to be skipped.',
    sections: [
      { h2: 'What we collect', p: 'Your email address, a one-way hashed password, display name and authentication tokens. Passwords are hashed with bcrypt and cannot be read back by us or anyone else. One-time email-verification and password-reset links are stored only as SHA-256 hashes, so a database leak cannot be replayed as a valid link.' },
      { h2: 'What we never publish', p: 'Your email address, phone number and contact details are never shown on your profile or to another member. Contact exchange happens only by mutual agreement.' },
      { h2: 'Photos', p: 'You choose who sees your photos: everyone, only after mutual interest, or only after matching. The default is the most private of those. Photos uploaded for identity verification are encrypted before they touch the disk and are readable only by administrators reviewing them.' },
      { h2: 'Wali and guardian access', p: 'A wali or guardian link can be revoked by the member at any time, permanently. Revocation takes effect immediately and cannot be undone by us.' },
      { h2: 'Encryption', p: 'Sensitive data is encrypted at rest with AES-256-GCM. Access tokens are revocable, and server-side role checks enforce who may read or change what.' },
      { h2: 'Your rights', p: 'You can request a copy of your data, ask for corrections, or ask us to delete your account. Use the contact form and we will action it.' },
    ],
  },

  '/terms': {
    title: 'Terms of Service | Shia Rishta',
    desc: 'The terms governing your use of Shia Rishta, the nikah-first Shia matrimony platform: who may join, what conduct is not allowed, and what we do not guarantee.',
    h1: 'Terms of Service',
    lede: 'These terms govern the use of Shia Rishta. By creating an account you agree to them. They are written plainly, because a contract nobody can read protects nobody.',
    sections: [
      { h2: 'Who may use Shia Rishta', p: 'Shia Muslims seriously seeking nikah, together with parents, guardians and trusted matchmakers acting on their behalf. Anyone found abusing the service may be removed.' },
      { h2: 'Your account', p: 'You are responsible for what happens under your account. Keep your sign-in details private, and tell us if you believe they have been compromised.' },
      { h2: 'Conduct', p: 'Shia Rishta exists for marriage with genuine intent. Impersonation, harassment, commercial solicitation, and any attempt to obtain contact details or photos without the other person’s consent are grounds for immediate removal.' },
      { h2: 'No guarantee of outcome', p: 'Shia Rishta provides a platform for introductions. We do not guarantee that any introduction leads to a marriage, and we are not a party to any relationship formed through the service.' },
      { h2: 'Cost', p: 'Shia Rishta is free. There is no payment system today, and no paid tier is required to browse, express interest, message a match, or use the guardian tools.' },
    ],
  },

  '/about': {
    title: 'About Shia Rishta – Nikah-First Shia Matchmaking',
    desc: 'Why Shia Rishta exists: a dignified, nikah-first alternative to swiping for Shia Muslims and their families, built on privacy-first photos and wali involvement.',
    h1: 'About Shia Rishta',
    lede: 'Shia Rishta exists because general dating apps were never built for nikah. They treat a marriage hunt like entertainment, and they treat a wali’s consent as an obstacle rather than part of the process.',
    sections: [
      { h2: 'Nikah first', p: 'Every profile is created with marriage intent. There is no swiping culture here and no incentive to keep people browsing — the goal is a suitable introduction, not daily engagement.' },
      { h2: 'Built for Shia practice', p: 'Sect, marja, religiosity and prayer practice are first-class fields, not afterthoughts in a free-text box. Generic matrimonial sites do not carry them at all.' },
      { h2: 'Family belongs in the process', p: 'Wali and guardian workflows are built into the journey from the start, because in Shia fiqh a virgin woman’s nikah requires her wali’s consent.' },
      { h2: 'Honest about size', p: 'We show real member numbers on this site, counted from the database. We do not publish testimonials we have not been given, or success stories that have not happened.' },
    ],
  },

  '/guardians': {
    title: 'Guardians & Wali Involvement in Shia Nikah | Shia Rishta',
    desc: 'How wali and guardian involvement works in Shia nikah: approvals, family-to-family introductions and chaperoned communication on Shia Rishta.',
    h1: 'Guardians & Family Connections',
    lede: 'In Shia nikah the wali is not an obstacle to work around — rulings vary by marja and circumstance, but family involvement is the norm, so the platform is built around it.',
    sections: [
      { h2: 'What a wali does here', p: 'A guardian can be linked to a member’s profile with explicit permissions: viewing introductions, approving conversations, and joining family-to-family messaging. Nothing happens in a wali’s name without their knowledge.' },
      { h2: 'Family-to-family introductions', p: 'When both sides are serious, introductions can move from individuals to families, with the wali included from the first message rather than informed after the fact.' },
      { h2: 'Privacy with oversight', p: 'Guardian involvement never means publishing private details. Contact information stays hidden, photos follow the member’s privacy tier, and every permission a guardian holds is visible to the member and revocable.' },
    ],
  },

  '/safety': {
    title: 'Safety & Verification Standards | Shia Rishta',
    desc: 'How Shia Rishta keeps members safe: identity verification, photo privacy tiers, mutual-interest messaging and human review.',
    h1: 'Safety and verification standards',
    lede: 'On a platform where the alternative is being catfished, safety is the product. These are the specific controls we operate.',
    sections: [
      { h2: 'Identity verification', p: 'Members can submit a selfie or an identity document for review. Submissions are encrypted at rest and reviewed by a person, not an algorithm alone. Verification is a badge on your profile, never a precondition for browsing.' },
      { h2: 'Photo privacy tiers', p: 'Choose who sees your photos: everyone, only people with mutual interest, or only matches. The most private setting is the default.' },
      { h2: 'Mutual-interest messaging', p: 'A conversation cannot start until both people have expressed interest. Nobody is ever notified of an unreciprocated approach, which removes the most common harassment vector on dating platforms.' },
      { h2: 'Reporting and blocking', p: 'Block anyone instantly and permanently. Report anything concerning and it enters a moderation queue an administrator reviews. Blocking is immediate and needs no approval from anyone.' },
      { h2: 'Data minimisation', p: 'We collect what a marriage introduction needs and no more. Contact details are never published, and deleting your account removes your data.' },
    ],
  },

  '/success-stories': {
    title: 'How Shia Rishta Works – Honest Nikah Matchmaking',
    desc: 'How Shia Rishta actually works: verified profiles, mutual-interest messaging, privacy controls and family-supported introductions. No invented stories.',
    h1: 'How Shia Rishta works',
    lede: 'We are not going to invent testimonials for you. No member has given us permission to publish their story yet, so this page describes how the service actually works instead.',
    sections: [
      { h2: 'What we will not claim', p: 'We do not publish member counts we have not counted, success stories that have not happened, or testimonials nobody consented to. Where a number matters, it comes from the database.' },
      { h2: 'How it works', steps: [
        { h3: '1. Create a profile with your intent', p: 'Set your marriage goals, religious practice, family background and timeline, plus the sect and marja filters that generic matrimonial sites do not carry.' },
        { h3: '2. Browse and express interest privately', p: 'Interest is one-sided until it is mutual, so nobody is notified of an unreciprocated approach.' },
        { h3: '3. Talk once you both agree', p: 'A conversation opens only after mutual interest. Contact exchange and photo unlocks require agreement from both sides.' },
      ] },
    ],
  },

  '/contact': {
    title: 'Contact Shia Rishta',
    desc: 'Reach the Shia Rishta team with questions, privacy or takedown requests, safety reports and partnership enquiries. Members can also raise a request here.',
    h1: 'Contact Shia Rishta',
    lede: 'Questions, privacy requests, takedown requests or partnership enquiries all reach the operations team through the contact form.',
    sections: [
      { h2: 'Before you write', p: 'Account, verification and privacy questions are answered fastest in your dashboard, where the support team can see your account state. Signed-in members can raise a request there directly.' },
      { h2: 'Privacy and takedown requests', p: 'Requests to access, correct or delete your data are actioned through the same form. Mark it clearly as a privacy request so it is routed correctly.' },
      { h2: 'Safety reports', p: 'To report abuse or a profile, use the report control on that profile if you are signed in, or contact us directly. Blocking is instant and separate from reporting.' },
    ],
  },

  '/blog': {
    title: 'Nikah & Marriage Guidance for Shia Muslims | Shia Rishta Blog',
    desc: 'Practical guidance on nikah, choosing a spouse, and married life for Shia Muslims — written for serious seekers and their families.',
    h1: 'Nikah and marriage guidance',
    lede: 'Practical guidance on nikah, choosing a spouse, and married life — written for serious seekers and the families supporting them.',
    sections: [
      { h2: 'What we write about', p: 'Nikah and its conditions, choosing a spouse, family expectations, and the practical questions that come up during a marriage introduction.' },
    ],
  },

  '/community': {
    title: 'Shia Community, Guidance & Events | Shia Rishta',
    desc: 'Community guidance and events for Shia Muslims preparing for nikah — the discussions, advice and community that happen before a profile ever does.',
    h1: 'Shia community and guidance',
    lede: 'Community guidance and events for Shia Muslims preparing for nikah — the conversations that happen before a profile does.',
    sections: [
      { h2: 'Beyond the profile', p: 'Guidance, discussion and events for members of the community, moderated by the operations team.' },
    ],
  },

  '/matchmaker': {
    title: 'Matchmaker — Add a Rishta Profile | Shia Rishta',
    desc: 'Know someone looking for a Shia rishta? Submit their profile as a matchmaker. Every submission is reviewed within 7 days.',
    h1: 'Matchmaker',
    lede: 'Add a profile for someone you know — family, friends, clients. Our team reviews every submission before it goes live.',
    sections: [
      { h2: 'How it works', p: 'Submit the details, we review within 7 days, approved profiles appear in browse. Unreviewed submissions are removed automatically.' },
    ],
  },

  '/biodata-maker': {
    title: 'Free Shia Marriage Biodata Maker | Shia Rishta',
    desc: 'Create a beautiful Shia marriage biodata online — no account needed. Add photo and details, pick a design, download with watermark.',
    h1: 'Marriage biodata maker',
    lede: 'Make a stunning marriage biodata in minutes. Free, no sign-up, download as an image.',
    sections: [
      { h2: 'Why use it', p: 'Four elegant templates designed for Shia marriage biodatas, with Bismillah header and family details sections. Your draft saves in your browser.' },
    ],
  },

  '/support': {
    title: 'Help & Support | Shia Rishta',
    desc: 'Get help with your Shia Rishta account, identity verification, privacy settings and messaging. Raising a request from your dashboard gets a faster answer.',
    h1: 'Help and support',
    lede: 'Help with your account, verification, privacy settings and messaging.',
    sections: [
      { h2: 'Getting a response faster', p: 'Support requests raised from your dashboard reach the team with your account state attached, which usually means a first answer sooner.' },
      { h2: 'Still stuck?', p: 'Use the contact form and tell us what you were trying to do and what happened instead.' },
    ],
  },

  '/profile-guide': {
    title: 'Profile Guide – Write a Strong Shia Rishta Profile',
    desc: 'Worked examples of strong Shia marriage profiles: how to write about deen, expectations, family and timeline so real families reach back.',
    h1: 'Writing a strong Shia rishta profile',
    lede: 'Worked examples of what a serious marriage profile actually says, and the mistakes that make families move on.',
    sections: [
      { h2: 'Write your intent clearly', p: 'State what you are looking for and by when. A family reading your profile should understand the shape of the match before they reply.' },
      { h2: 'Say something about deen and practice', p: 'Sect, marja and level of practice belong in structured fields, not a paragraph someone has to guess at.' },
      { h2: 'Family and expectations', p: 'Expectations of a spouse and the role of family are normal to state. They are also most of what families are actually deciding.' },
    ],
  },

  '/agents': {
    title: 'Matchmaking Agents & Family Introductions | Shia Rishta',
    desc: 'Family members and matchmakers can create private, photo-free introductions on Shia Rishta — with the person concerned in control throughout.',
    h1: 'Family introductions and matchmakers',
    lede: 'A parent, guardian or trusted matchmaker can create a private, photo-free introduction — with the person concerned in control throughout.',
    sections: [
      { h2: 'How it works', p: 'An introduction is created without photos. The person it concerns reviews and decides whether to take it further. A matchmaker cannot speak for them, and an introduction cannot be published over their objection.' },
      { h2: 'Control stays with the member', p: 'Any introduction can be withdrawn by the person it concerns, at any time and permanently.' },
    ],
  },

  '/auth/register': {
    title: 'Create Your Free Account | Shia Rishta',
    desc: 'Create a free Shia Rishta profile for nikah — privacy-first photos, wali and guardian workflows, and no payment required.',
    h1: 'Create your free account',
    lede: 'Creating a profile, browsing, expressing interest and using the guardian tools are all free. There is no payment system today.',
    sections: [
      { h2: 'What we ask for', p: 'An email address, a password, and the basics of who you are and what you are looking for. You control what is published, and your contact details are never shown.' },
      { h2: 'Privacy from the start', p: 'Your photos default to the most private setting, conversations require mutual interest, and any guardian link can be revoked permanently.' },
    ],
  },

  '/auth/login': {
    title: 'Log in | Shia Rishta',
    desc: 'Log in to manage your Shia Rishta profile, favourites and conversations. Forgotten your password? Reset links are single-use and stored as hashes.',
    h1: 'Log in',
    lede: 'Log in to manage your profile, favourites and conversations.',
    sections: [
      { h2: 'Forgotten your password?', p: 'Use the reset link on the sign-in page. Reset tokens are stored only as hashes, so an emailed link cannot be replayed from a leaked database.' },
    ],
  },
};

// Routes deliberately NOT prerendered.
//
// Private and token-bearing paths stay on the plain SPA shell with noindex.
// Prerendering them would bake the existence of member-only screens into served
// HTML, and a /verify/<token> or /wali/<token> file on disk would turn a
// one-time secret into a guessable, cacheable URL.
export const NO_PRERENDER = [
  '/dashboard', '/messages', '/settings', '/onboard', '/profile', '/drafts',
  '/verify', '/wali', '/claim', '/admin', '/login', '/signup', '/signin',
];

export const SITE_URL = 'https://shiarishta.com';