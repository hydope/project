// Assistant brain — platform guidance + halal conversation skills.
export const SUGGESTIONS = [
  'Halal rizz 💬','How do I get verified?','How is my privacy protected?',
  'How does onboarding work?','How do I report a concern?','Great first chat tips?',
];
export const WELCOME = 'Assalamu alaikum! I am your Shia Rishta guidance assistant. I can help you navigate the platform — verification, privacy, safety, onboarding, community spaces, and respectful conversation skills.';
const BLOCK = /(nude|naked|porn|sex|sexual|hookup|onlyfans|erotic|escort|send me a nude|explicit|lewd|sext|pussy|dick|boob|fuck|nigga|nigger|faggot|tranny|cheating|affair|camgirl|strip|chaturbate|money for sex|send crypto|kill myself|suicide|self harm|you are worthless|how to fake|underage|minor|deepfake|nsfw|whatsapp me|move to whatsapp)/i;
function guard(t){return BLOCK.test(t)?'🛡️ That request is outside what I can help with. Shia Rishta is a nikah-first platform, so I will not assist with anything explicit, sexual, deceptive, financial, or harmful.\n\nUse the ⚠ flag on a profile/message, or email support@shiarishta.com — we review safety reports within 24h.':null;}
const R = {
  verify: 'Verification is free and private. Verify your identity with a selfie or government ID — only our team sees the document, never other members.\n\n• Gold badge = identity document verified (government ID)\n• Blue badge = photo verified (selfie matches your profile photos)\n\nYou can also confirm your email, so others know the account is real. Find it in Settings → Verification.',
  nikah: 'Yes — Shia Rishta is nikah-first, not a dating app.\n\n• It is built for people seeking a serious marriage: profiles state intentions, faith practice and what they are looking for.\n• Messaging opens only after a mutual interest — both sides expressed interest.\n• Family and wali involvement are part of the design: a member can list a guardian (wali) who gets read-only access to the profile, and verified matchmakers and guardians can open introductions.\n• Privacy is built around that purpose: photos are public (anyone), members-only (any signed-in member), or private (only you), and members control who sees each detail.',
  privacy: 'Privacy-first by design.\n\n• Photos: Public (anyone can see), Members-only (any signed-in member), or Private (only you).\n• Messages and identity uploads are encrypted at rest (AES-256-GCM).\n• Incognito mode hides your profile from search.\n• Block/report any member from their profile or chat.\n\nChange anytime in Settings → Privacy.',
  safety: 'Your safety matters.\n\n• Flag any member with ⚠ on their profile/chat — reviewed within 24h.\n• Block instantly from Messages or profile.\n• Never send money, bank details, crypto, or personal identifiers.\n• Red flags: rushing off-app, asking for money, refusing chaperoned calls.\n\nsupport@shiarishta.com',
  price: 'Shia Rishta is completely free — for everyone, with no paid tier.\n\n• Creating a profile, browsing, expressing interest and messaging are all free, with no paywall anywhere.\n• Identity verification is included for every member, never sold as an upgrade.\n• None of your privacy controls are a premium feature.\n\nThere is nothing to buy and nothing hidden behind a payment.',
  onboard: 'Onboarding is dignified and complete.\n\n1. Create account + confirm email.\n2. Set intentions, faith practice, what you seek.\n3. Add halal-appropriate photos — clarity helps matching.\n4. Complete verification when ready.\n5. Browse /profiles with filters: sect, religiosity, education, verified-only.\n\nPause anytime — nothing is forced.',
  chat: 'First messages: specific, kind, low-pressure.\n\n• "Assalamu alaikum — what inspired your city?"\n• "I noticed you love [hobby]. I share that too!"\n• "Your intentions resonated. How do you picture year one?"\n\nAsk open questions, mirror respect, move deeper chats into chaperoned calls once trust is built.',
  community: 'Community spaces for respectful sharing.\n\n• Join subreddit-style groups: /hyderabad, /dallas, /london, /toronto, /reverts, /parents.\n• Post anonymously — your name hidden, post visible.\n• Guests read everything; to comment/post, register or log in.\n• Keep it kind and on-topic.',
  rizz: 'Halal rizz — respectful conversation skills 🌙\n\nBest "rizz": sincerity, attentiveness, dignity.\n\n• "Salam! Your profile made me smile — what do you never get asked?"\n• Compliment a value: "Your take on family stood out."\n• "Tea or coffee? Compatibility question, obviously."\n• Be specific — reference a real detail from their profile.\n• Let family in when right, bring a chaperone once serious.\n\nNo pressure, no love-bombing, no rushing, dignity first.',
  match: 'Better matches on Shia Rishta:\n\n• Complete your profile — boosts visibility and ranking.\n• Be specific about intentions, lifestyle, religiosity.\n• Upload clear, halal-appropriate photos.\n• Use /profiles filters: sect, religiosity, education, verified-only, location.\n• Read before reaching out — thoughtful > generic.\n\nCompatibility blends faith, lifestyle, timeline.',
};
const FALLBACK = 'I can help with: verification, privacy, safety, onboarding, community spaces, first-message skills, or respectful conversation tips. What would you like to know?';
const RULES = [
  {t:/(nikah-first|nikah first|nikah|marriage-first|marriage first|dating app|not a dating|serious marriage)/i,k:'nikah'},
  {t:/(verify|verification|badge|identity)/i,k:'verify'},
  {t:/(privacy|private|photo|blur|hide|incognito|who sees|screenshot)/i,k:'privacy'},
  {t:/(report|abuse|block|harass|inappropriate|scam|concern|safety|red flag)/i,k:'safety'},
  // 'price' is deliberately NOT one of the offered topics: the platform has no
  // pricing page. The rule stays only so "is it free?" still gets a truthful,
  // confident answer instead of falling through to the generic fallback.
  {t:/(price|pricing|plan|cost|premium|subscription|how much|free)/i,k:'price'},
  {t:/(onboard|get started|sign up|register|first steps|setup)/i,k:'onboard'},
  {t:/(first chat|first message|what do i say|how to start|conversation|ice|open)/i,k:'chat'},
  {t:/(community|subreddit|forum|anonymous|post|comment|hyderabad|dallas|london|toronto|reverts|parents)/i,k:'community'},
  {t:/(rizz|impress|charm|flirt|icebreaker|opener|pickup|talk to (a |the )(girl|boy)|talk to (her|him)|attract|impress (a|the) girl|conversation skills)/i,k:'rizz'},
  {t:/(match|search|find|compatible|profile tips|more matches|visibility|ranking)/i,k:'match'},
];
export function getReply(raw) {
  const text = String(raw || '').toLowerCase().trim();
  if (!text) return FALLBACK;
  const b = guard(text); if (b) return b;
  if (/^(hi|hey|hello|salam|salaam|assalam|assalamu alaikum|marhaba|good|wa alaikum)/i.test(text))
    return 'Wa alaikum assalam! 👋 Ask me about verification, privacy, safety, onboarding, community spaces, or respectful conversation skills.';
  for (const r of RULES) if (r.t.test(text)) return R[r.k];
  return FALLBACK;
}
