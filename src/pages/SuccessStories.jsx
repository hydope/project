import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import {
  Heart, ShieldCheck, Lock, Users, CheckCircle, ArrowRight, UserCheck, Eye,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// This page used to list six couples with names, cities, wedding dates, 5-star
// ratings and first-person quotes, under a stats bar claiming "2,400+ marriages",
// "96% satisfaction" and "3.2 months average to engagement". None of it was real.
// One quote specifically thanked "the chaperone mode" -- a feature that never
// worked and has since been removed.
//
// Fabricated testimonials are not a marketing shortcut. They are a false-
// advertising problem (FTC s5 for US users), they get the platform sued, and
// they poison every other number on the site: if the couples are invented, why
// should anyone believe the member count?
//
// Until real couples consent to being listed -- with their names, their own
// words, and their permission -- this page does the only honest thing available
// and explains exactly how the product behaves.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: Users,
    title: 'A profile, on your terms',
    body: 'You choose how discoverable you are: public to everyone, members only, or private until you say otherwise. Photo visibility is a separate control, so a visible profile is never a visible photo by default.',
    points: ['Profile and photo privacy are two independent controls', 'Change either at any time', 'Private profiles are absent from search and from other members'],
  },
  {
    icon: Lock,
    title: 'Messaging stays closed until you both agree',
    body: 'Anyone can send interest. A conversation opens only when interest runs both ways. There are no cold approaches, and nobody can reach you because they guessed your email address.',
    points: ['Mutual interest required before a single message', 'Phone numbers, emails and handles are removed before a message is stored', 'Blocking cuts existing history too, not just new sends'],
  },
  {
    icon: ShieldCheck,
    title: 'Verification you can actually check',
    body: 'Submit a government ID or a selfie. It is encrypted before it touches the disk, read only by our review team, and never shown to another member. Verified members carry a visible badge.',
    points: ['ID document and selfie accepted', 'Encrypted at rest with AES-256-GCM', 'Reviewed by a person, not a guess'],
  },
  {
    icon: UserCheck,
    title: 'When family goes first, that is supported',
    body: 'A family member or approved matchmaker can create a private introduction on someone else`s behalf and share it by secure link. It carries no photos, expires after 45 days, and the person it concerns stays in control throughout.',
    points: ['No photos are ever attached to an introduction', '45-day expiry, plus a short code', 'Claim it, decline it, or have it withdrawn -- their call, always'],
  },
  {
    icon: Eye,
    title: 'Filters that reflect what matters',
    body: "Narrow by sect, Marja' affiliation, religiosity, education, location and photo-access tier before anyone exchanges a word. A shared Marja' decides which rulings govern a household -- it is not a detail.",
    points: ['Sect, sub-sect and Marja', 'Religiosity, education, location, age', 'Verified-only and photo-access tiers'],
  },
  {
    icon: Heart,
    title: 'Free, and no paywalls',
    body: 'Profile creation, browsing, interest and messaging are all free. Identity verification is included for every member. Nothing about your privacy is a premium feature.',
    points: ['No paywall on messaging or contact', 'Verification included for everyone', 'No paid tier today'],
  },
];

export default function SuccessStories() {
  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            How Shia Rishta works
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-2">
            What we actually do
          </h1>
          <p className="text-muted mt-3 max-w-2xl mx-auto leading-relaxed">
            We have not published member success stories yet. Inventing them would
            be the fastest way to look established, and the surest way to lose the
            trust this platform depends on. So instead, here is precisely how the
            product behaves.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.article
                key={step.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card p-6"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-bold text-ink mb-2">{step.title}</h2>
                <p className="text-sm text-muted leading-relaxed mb-3">{step.body}</p>
                <ul className="space-y-1.5">
                  {step.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-muted">
                      <CheckCircle
                        className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                        style={{ color: 'var(--color-success, #10b981)' }}
                        aria-hidden="true"
                      />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>

        <div
          className="card p-8 mt-8 text-center"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <h2 className="text-xl font-bold text-ink mb-2">Married through Shia Rishta?</h2>
          <p className="text-sm text-muted max-w-lg mx-auto leading-relaxed mb-5">
            If you found your spouse here and you would like your story listed
            with your real name and your own words, get in touch. We publish only
            with your explicit permission, and we send you the exact text before
            anything goes up.
          </p>
          <Link
            to="/contact"
            className="button primary inline-flex items-center gap-2 px-5 py-2.5"
          >
            Share your story <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </Layout>
  );
}