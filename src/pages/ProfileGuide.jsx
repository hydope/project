import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import SampleProfileBadge from '../components/SampleProfileBadge';
import { XCircle, Lightbulb, ArrowRight, Quote, Sparkles, ChevronDown } from 'lucide-react';

/**
 * Profile guide — teaches members how to write a profile that leads somewhere.
 *
 * The examples below are written to the same standard a strong real profile
 * should meet: specific about faith practice, honest about what they want,
 * concrete about family and timeline. They are templates, not members. Every
 * card carries the SampleProfileBadge so nobody confuses an example with a
 * person, and none of them can be messaged.
 *
 * This exists because the strongest predictor of a useful introduction is the
 * quality of the profile underneath it. Teaching that is worth more than any
 * amount of filler on the browse page.
 */

const STRONG_EXAMPLES = [
  {
    name: 'Zainab H.', age: 27, location: 'Karachi, Pakistan',
    headline: 'Software engineer, Karachi — looking for a deen-centred home',
    fields: [
      ['Prayer', 'All 5 daily, Fajr most days'],
      ['Marja', 'Ayatollah al-Sistani'],
      ['Education', "Master's, Computer Science"],
      ['Timeline', 'Within 1–2 years'],
    ],
    bio: 'I completed my MSc last year and work as a software engineer at a product company in Karachi. Prayer is the fixed point of my day — Fajr before work, and I try to keep the evening prayers too. I grew up in a household where majlis was weekly and learning was not optional, and I want a home where that is simply the rhythm rather than something we have to argue for.',
    expectations: 'Someone serious about deen who prays and is trying to do better, not just someone with the same surname. I would like a partner who reads, asks questions before agreeing to things, and can disagree with me without it turning into a fight. I have a good life already and I am looking to share it, not to complete a picture of myself.',
    family: 'Both parents live in Karachi. My ammi is a schoolteacher and my abbu retired from the Pakistan Navy. They are involved and would want to be part of any introduction. No brothers; one younger sister in medical school.',
    why: 'Names a real city, an honest rhythm of worship, and what she actually wants in a person rather than a job title.',
  },
  {
    name: 'Ali R.', age: 30, location: 'Manchester, United Kingdom',
    headline: 'Structural engineer, Manchester — practising, family-oriented',
    fields: [
      ['Prayer', 'All 5 daily'],
      ['Marja', 'Ayatollah al-Khamenei'],
      ['Education', 'MEng, Structural Engineering'],
      ['Timeline', 'Within 6–12 months'],
    ],
    bio: 'I am a structural engineer, seven years into the profession and partway through a part-time MSc. I grew up in London and moved here for work four years ago. I have kept all five prayers and have not missed Fajr in two years, which is the habit I am most proud of. Outside work I cook badly and play cricket badly, and I am told my table manners are acceptable.',
    expectations: 'I want a partner who is honest with me early rather than agreeable for months. Practice matters to me — not in the sense of policing, but I would like deen to be something we share rather than my private discipline. Tell me early if you are unsure about anything and we will work out whether it fits.',
    family: 'My parents are in London and visit most months. I am the eldest of four — two brothers and a younger sister. My father would want to speak with anyone serious, which I think is fair.',
    why: 'Concrete and unshowy. A specific habit with a specific timeframe, and a stated willingness to be judged early.',
  },
  {
    name: 'Fatima S.', age: 29, location: 'Toronto, Canada',
    headline: 'Resident physician, Toronto — recently relocated, rebuilding community',
    fields: [
      ['Prayer', 'All 5 daily'],
      ['Marja', 'Ayatollah al-Sistani'],
      ['Education', 'MD'],
      ['Timeline', 'Open to discussing'],
    ],
    bio: 'I finished my residency in Toronto in the spring and have just moved into a new place in Scarborough. Three years of on-call shifts left my sleep upside down for most of a decade, and I am enjoying being tired in an ordinary way now. I cook a lot, read when I can stay awake, and I am slowly learning how to be in a community rather than passing through one.',
    expectations: 'I do not yet know exactly what I am looking for and I would rather not pretend otherwise. I want someone kind and practising, comfortable with a woman who works irregular hours. If you need everything settled on a schedule, I am probably not a fit — and that is much better said early than late.',
    family: 'My parents are in Lahore and my younger brother is in Dubai. We are close and speak most weeks. I expect to travel to Pakistan within the year, so the practical side of distance is something I have already thought about.',
    why: 'Admits uncertainty instead of faking confidence. That reads as far more trustworthy than a polished certainty.',
  },
];
const WEAK_PATTERNS = [
  {
    bad: 'I am a simple, down-to-earth, family-oriented person looking for a life partner.',
    why: 'Every word is a claim with nothing behind it. "Family-oriented" describes half the people reading it, so it singles nobody out. With no detail there is nothing to reply to, so nothing starts.',
  },
  {
    bad: 'I am a handsome, tall, successful businessman. I have my own car and house and I am looking for a beautiful simple girl.',
    why: 'This lists an outcome rather than describing a person, and frames the search as one person choosing another — when a serious introduction is two families getting to know each other.',
  },
  {
    bad: 'Practicing Shia, single, no negatives, good family, interested in marriage.',
    why: 'Checkbox answers with no life inside them. Every line is true of most profiles on the page, which is exactly why it communicates nothing.',
  },
];

const SECTIONS_GUIDE = [
  {
    title: 'About',
    body: 'A few sentences on your actual life right now: where you are, what your days look like, what a normal week involves. Include one specific detail — a habit, a trip, something you are learning. Specificity is what gives someone a reply to make.',
  },
  {
    title: 'What I am looking for',
    body: 'The section most people leave blank, and the one that matters most. Name the qualities you care about and be honest about your situation, including whether you are ready soon or still open. "Open to discussing" is a real answer and beats a confident timeline you cannot keep.',
  },
  {
    title: 'About my family',
    body: 'Who they are, where they are, and how involved they would be in a match. Family involvement is normal here and expected — saying so early saves everyone weeks. Wali links are part of how an introduction happens properly.',
  },
  {
    title: 'Faith practice',
    body: 'Prayer, Marja\', and how practice actually shows up in your week. Be precise rather than aspirational: "all five, Fajr most days" tells someone what life with you looks like in a way that "very practising" never does.',
  },
];

export default function ProfileGuide() {
  usePageTitle('Profile Guide');
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <ProfileGuideHero />
        <StrongExamples />
        <WeakPatterns />
        <SectionsGuide openIndex={openIndex} setOpenIndex={setOpenIndex} />
        <GuideCta />
      </main>
    </Layout>
  );
}

function ProfileGuideHero() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">Profile guide</span>
      <h1 className="text-3xl sm:text-5xl font-bold text-ink mt-2">
        What a strong profile looks like
      </h1>
      <p className="text-muted mt-4 max-w-2xl mx-auto text-lg leading-relaxed">
        The examples below are written to a high standard — specific about faith
        practice, honest about intentions, concrete about family. Study them, then
        write your own in your own words.
      </p>
      <p className="text-sm mt-4 max-w-2xl mx-auto" style={{ color: 'var(--color-ink-tertiary)' }}>
        These are examples we wrote, not real members. Each one is labelled as a
        sample, and none of them can receive a message.
      </p>
      <Link to="/onboard" className="btn btn-primary mt-6 inline-flex items-center gap-2">
        Create your profile <ArrowRight className="w-4 h-4" />
      </Link>
    </motion.div>
  );
}

function StrongExamples() {
  return (
    <div className="mb-16">
      <h2 className="text-2xl font-bold text-ink mb-2">Worked examples</h2>
      <p className="text-muted mb-8">
        Three profiles that would get a genuine reply. Read them for structure and
        level of detail — not as text to copy.
      </p>
      <div className="space-y-6">
        {STRONG_EXAMPLES.map((ex, i) => (
          <motion.article
            key={ex.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
          >
            <header
              className="px-5 py-4 flex flex-wrap items-start justify-between gap-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div>
                <h3 className="font-bold text-ink">{ex.name}, {ex.age}</h3>
                <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>{ex.location}</p>
                <p className="text-sm mt-1 font-medium" style={{ color: 'var(--color-primary)' }}>{ex.headline}</p>
              </div>
              <SampleProfileBadge />
            </header>

            <dl
              className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              {ex.fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-ink-tertiary)' }}>{label}</dt>
                  <dd className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="px-5 py-4 space-y-4">
              <div>
                <h4 className="text-sm font-bold mb-1.5" style={{ color: 'var(--color-ink)' }}>About</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>{ex.bio}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold mb-1.5" style={{ color: 'var(--color-ink)' }}>What I am looking for</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>{ex.expectations}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold mb-1.5" style={{ color: 'var(--color-ink)' }}>About my family</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>{ex.family}</p>
              </div>
            </div>

            <footer className="px-5 py-3.5" style={{ background: 'var(--color-surface)' }}>
              <p className="text-xs flex items-start gap-2" style={{ color: 'var(--color-primary)' }}>
                <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span><strong className="font-semibold">Why it works:</strong> {ex.why}</span>
              </p>
            </footer>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

function WeakPatterns() {
  return (
    <div className="mb-16">
      <h2 className="text-2xl font-bold text-ink mb-2">What to cut</h2>
      <p className="text-muted mb-8">
        These three appear constantly. Each one reads well and says almost nothing.
      </p>
      <div className="grid md:grid-cols-3 gap-5">
        {WEAK_PATTERNS.map((w, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.07 }}
            className="rounded-2xl p-5"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
          >
            <Quote className="w-5 h-5 mb-3" style={{ color: 'var(--color-danger, #b3261e)' }} />
            <p className="text-sm italic mb-3 leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
              &ldquo;{w.bad}&rdquo;
            </p>
            <XCircle className="w-4 h-4 mb-1.5" style={{ color: 'var(--color-danger, #b3261e)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-tertiary)' }}>{w.why}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SectionsGuide({ openIndex, setOpenIndex }) {
  return (
    <div className="mb-16">
      <h2 className="text-2xl font-bold text-ink mb-2">Section by section</h2>
      <p className="text-muted mb-8">What belongs in each part of the form.</p>
      <div className="space-y-3">
        {SECTIONS_GUIDE.map((s, i) => {
          const open = openIndex === i;
          return (
            <div
              key={s.title}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
            >
              <button
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
              >
                <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>{s.title}</span>
                <ChevronDown
                  className="w-4 h-4 flex-shrink-0 transition-transform"
                  style={{ color: 'var(--color-ink-tertiary)', transform: open ? 'rotate(180deg)' : 'none' }}
                />
              </button>
              {open && (
                <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
                  {s.body}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideCta() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-8 sm:p-10 text-center"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
    >
      <Sparkles className="w-7 h-7 mx-auto mb-3" style={{ color: 'var(--color-primary)' }} />
      <h2 className="text-2xl font-bold text-ink mb-3">Now write yours</h2>
      <p className="text-muted max-w-xl mx-auto mb-6">
        It takes about ten minutes. You control what is visible and when — photos
        stay private until you choose, and messaging only opens once interest is
        mutual from both sides.
      </p>
      <Link to="/onboard" className="btn btn-primary inline-flex items-center gap-2">
        Create your free profile <ArrowRight className="w-4 h-4" />
      </Link>
    </motion.div>
  );
}

