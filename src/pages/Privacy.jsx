import { motion } from 'framer-motion';
import Layout from '../layouts/LandingLayout';
import { Lock, Eye, UserCheck, Download, FileText, Users } from 'lucide-react';

// Every field below is grounded in the real database schema
// (php-api/db/schema.sql) and the actual data flows — not a guess.
// If a field is not listed here, we do not collect it.
const sections = [
  {
    id: 'data-we-collect',
    title: '1. Information We Collect',
    icon: Download,
    content: [
      { heading: 'Profile Information', text: 'Display name, date of birth (stored only to enforce the 18+ minimum age), age, gender, city, country, citizenships, profession, education level, ethnicity, sub-ethnicity, languages, bio, about your family, and faith details (sect, religiosity, marja, modesty practice, diet). Also height, income range, marital status, children and children plans, relocation, family involvement, nikah timeline, seeking gender, what you are looking for, syed status, and username. If a guardian manages your profile, we store the management mode plus the guardian\u2019s name and email. These are provided voluntarily during onboarding and can be edited at any time. Your marja is collected for matching but is never shown to other members.' },
      { heading: 'Account Information', text: 'Email address, hashed password, display name, role, email-verified status, and verification status with reviewer notes. We never store your password in plain text — passwords are one-way hashed (bcrypt) and cannot be read back, by us or anyone else. One-time email verification and password-reset links are stored only as SHA-256 hashes, so a database leak cannot be replayed as a valid link. If you sign in with Google or Facebook, we store that provider\u2019s account ID — never your password there.' },
      { heading: 'Photos & Media', text: 'Profile photos you upload, stored on our server. You choose who can see them — everyone, signed-in members only, or only you (the default is members-only) — and you can change or remove them at any time. We do not publish your photos to search engines or third parties, and we do not sell or license your images to anyone.' },
      { heading: 'Identity Verification', text: 'A government ID or selfie you submit for a verification badge. The file is encrypted at rest before it is written to disk, readable only by our review team, and never shown to another member. The file is deleted once the review is complete; the decision (approved or rejected), the badge, and the review note are kept while your account is active.' },
      { heading: 'Messages & Activity', text: 'Messages you send (encrypted at rest with AES-256-GCM — only the two participants can read them; our staff cannot read your message history), interests you express, profiles you block or report, reports you file, matchmaker submissions, guardian/wali links, biodata drafts, community posts and replies, support tickets, and — only if you delete your account — the optional reason you chose to leave.' },
      { heading: 'Usage & Analytics', text: 'Pages viewed, search filters used, device and browser information, and an anonymous day-scoped visitor hash for aggregate analytics. This helps us improve the platform and recommend better matches. It is never used for advertising and never sold.' },
    ]
  },
  {
    id: 'how-we-use',
    title: '2. How We Use Your Information',
    icon: UserCheck,
    content: [
      { heading: 'Matching & Recommendations', text: 'Your profile details and preferences power our Compatibility Index, a transparent weighted score. We use this data solely to suggest relevant matches — never for advertising or sold to third parties. Fields you choose to hide from other members are still used for matching and filters; only their display is hidden.' },
      { heading: 'Communication', text: 'We facilitate messaging between matched members. Messages are encrypted in transit (TLS) and encrypted at rest (AES-256-GCM), so a stolen database or backup does not reveal message contents. Only the two participants can read a conversation. Our staff cannot read your message history.' },
      { heading: 'Safety & Verification', text: 'ID verification uploads are encrypted at rest before being written to disk and are readable only by our review team. Submission files are never shared with other members, never used for advertising, and are deleted once the review is complete. We review reported content to maintain community safety.' },
      { heading: 'Platform Improvement', text: 'Aggregated, anonymized usage data helps us improve features, fix bugs, and understand how members navigate the platform.' },
    ]
  },
  {
    id: 'privacy-controls',
    title: '3. Your Privacy Controls',
    icon: Eye,
    content: [
      { heading: 'Photo Visibility', text: 'Choose between: everyone, signed-in members only, or only you. The default is members-only. You decide who can open each photo, and you can change this at any time.' },
      { heading: 'Profile Visibility', text: 'By default your profile appears in browse and search for signed-in members. Incognito hides your profile from browse and search while you keep browsing; Private hides it from everyone but you.' },
      { heading: 'Discreet Browsing', text: 'Incognito mode hides your profile from browse and search. There are no visitor lists and no online-status indicator on the platform — nobody can see whether you are online or whose profile you viewed.' },
      { heading: 'Hide Individual Fields', text: 'In Settings → Privacy & Safety you can hide individual profile fields (such as height, children, or what you are looking for) from other members. Hidden fields are still used for matching and filters — only the display is hidden. Your display name, verification badges, guardian badge, and photo-visibility setting cannot be hidden.' },
      { heading: 'Guardian Management', text: 'Add or remove guardians at any time. Only you can revoke a guardian link — the person holding it cannot. A revoked link can be restored within 24 hours; after that it is gone for good and you will need to generate a new one.' },
      { heading: 'Data Export & Deletion', text: 'Export all your data at any time from Settings → Account. Delete your account yourself from Settings → Account → Delete account (type DELETE to confirm). Your profile, messages, interests, and reports are removed immediately; backups are purged within 30 days.' },
    ]
  },
  {
    id: 'data-sharing',
    title: '4. Data Sharing & Disclosure',
    icon: Users,
    content: [
      { heading: 'We Never Sell Your Data', text: 'Your personal information is never sold, rented, or shared with third parties for marketing purposes. Period.' },
      { heading: 'Service Providers', text: 'We use trusted third-party services (cloud hosting, email delivery) under strict data processing agreements. They access data only to provide services on our behalf. There is no payment processor — the site has no paid tier and no payment system.' },
      { heading: 'Legal Requirements', text: 'We may disclose information if required by law, court order, or to protect the rights, property, or safety of Shia Rishta, our users, or the public.' },
    ]
  },
  {
    id: 'security',
    title: '5. Security',
    icon: Lock,
    content: [
      { heading: 'Encryption', text: 'All data is encrypted in transit (TLS 1.3). Message contents and identity-verification uploads are additionally encrypted at rest (AES-256-GCM), so a stolen database or backup does not reveal them. Passwords are one-way hashed and cannot be recovered by anyone, including us.' },
      { heading: 'Authentication', text: 'Passwords are hashed using bcrypt. There is no two-factor authentication on the platform today.' },
      { heading: 'Monitoring', text: 'We monitor for suspicious activity and unauthorized access attempts. Accounts with unusual activity may be temporarily locked for protection.' },
    ]
  },
  {
    id: 'retention',
    title: '6. Data Retention',
    icon: FileText,
    content: [
      { heading: 'Active Accounts', text: 'Your data is retained as long as your account is active. You can export or delete it at any time.' },
      { heading: 'Deleted Accounts', text: 'When you delete your account, your profile, messages, interests, reports, guardian links, verification submissions, and biodata drafts are deleted immediately. Backups are purged within 30 days. Anonymized analytics data (the day-scoped visitor hash, with no link to your account) may be retained indefinitely. An account-deletion reason you chose to leave is kept without your name or email, so we can learn why members leave.' },
      { heading: 'Matchmaker Submissions', text: 'A matchmaker-submitted profile that is not confirmed by the person it is about, or not reviewed by an admin, is automatically deleted after 7 days.' },
      { heading: 'Verification Files', text: 'Identity documents and selfies are deleted once the review is complete; the decision and badge are kept while your account is active.' },
      { heading: 'Legal Holds', text: 'If required by law or legal proceedings, certain data may be retained beyond the standard period.' },
    ]
  },
];

export default function Privacy() {
  return (
    <Layout>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Your privacy matters</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-2">Privacy Policy</h1>
          <p className="text-muted mt-2">Last updated: November 2026</p>
          <p className="text-sm text-muted mt-4 max-w-2xl mx-auto">
            At Shia Rishta, privacy is a right — not a premium feature. This policy explains what we collect, how we use it, and the controls you have.
          </p>
        </motion.div>

        <div className="space-y-8">
          {sections.map((section, i) => (
            <motion.div key={section.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-elevated rounded-2xl border border-line/20 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><section.icon className="w-5 h-5 text-primary" /></span>
                <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              </div>
              <div className="space-y-4">
                {section.content.map(item => (
                  <div key={item.heading}>
                    <h3 className="font-semibold text-ink text-sm mb-1">{item.heading}</h3>
                    <p className="text-sm text-muted leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 p-6 rounded-2xl bg-primary/5 border border-primary/15">
          <h2 className="font-bold text-ink mb-2">Questions about privacy?</h2>
          <p className="text-sm text-muted">Contact our Data Protection Officer at <a href="mailto:privacy@shiarishta.com" className="text-primary hover:underline">privacy@shiarishta.com</a>. We respond within 24 hours.</p>
        </div>
      </main>
    </Layout>
  );
}
