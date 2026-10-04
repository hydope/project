import { motion } from 'framer-motion';
import Layout from '../layouts/LandingLayout';
import { FileText, Shield, AlertTriangle, Scale, Users, Heart, CheckCircle, XCircle, Clock } from 'lucide-react';

const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    icon: CheckCircle,
    content: 'By accessing or using Shia Rishta ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform. These terms apply to all visitors, registered members, and guardians.'
  },
  {
    id: 'eligibility',
    title: '2. Eligibility',
    icon: Users,
    content: 'You must be at least 18 years old to use Shia Rishta. By registering, you confirm you are 18+, seeking a serious marriage prospect (not casual dating), and have the legal capacity to enter into these terms. Parents/guardians may create and manage profiles on behalf of minors aged 18+ with appropriate consent.'
  },
  {
    id: 'accounts',
    title: '3. Account Responsibilities',
    icon: Shield,
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate, current information and promptly update your profile. One person may not maintain multiple accounts. Guardian-managed profiles require verified guardian consent. You are liable for all activity under your account.'
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use',
    icon: Heart,
    content: 'Shia Rishta is a serious matrimonial platform. You agree to: provide truthful profile information; communicate respectfully; respect others\' privacy settings; use guardian/chaperone tools appropriately; report safety concerns promptly; not use the platform for harassment, fraud, impersonation, solicitation, or any unlawful purpose.'
  },
  {
    id: 'prohibited',
    title: '5. Prohibited Conduct',
    icon: XCircle,
    content: 'The following result in immediate account termination: creating false profiles or impersonating others; harassing, threatening, or stalking members; sharing explicit or inappropriate content; scraping or automated data collection; circumventing privacy controls; selling or commercializing platform content; misrepresenting religious identity or intentions; any activity that endangers community safety.'
  },
  {
    id: 'privacy',
    title: '6. Privacy & Data',
    icon: Shield,
    content: 'Your privacy is governed by our Privacy Policy (incorporated herein). Message contents and identity-verification uploads are encrypted at rest (AES-256-GCM) and all traffic is encrypted in transit (TLS). Passwords are one-way hashed and cannot be recovered. You control profile and photo visibility. We never sell personal data. Refer to our Privacy Policy for full details on data collection, use, and your rights.'
  },
  {
    id: 'payments',
    title: '7. Payments & Subscriptions',
    icon: FileText,
    content: 'Shia Rishta is free and always will be: there are no payments, subscriptions, billing, or paid membership tiers in any part of this platform, and you will never be asked for payment details. We will not introduce a paid tier without telling members first and updating these terms.'
  },
  {
    id: 'termination',
    title: '8. Termination',
    icon: AlertTriangle,
    content: 'Either party may terminate this agreement at any time. You may delete your account from Settings → Account. We may suspend or terminate accounts that violate these terms. Upon termination, your right to use the platform ceases immediately. Data deletion follows our Privacy Policy schedule.'
  },
  {
    id: 'liability',
    title: '9. Limitation of Liability',
    icon: Scale,
    content: 'Shia Rishta provides the platform "as is." We do not guarantee specific match outcomes, continuous availability, or compatibility accuracy. We are not liable for user conduct, third-party actions, or indirect damages. Our total liability is limited to the amount you paid in the preceding 12 months.'
  },
  {
    id: 'changes',
    title: '10. Changes to Terms',
    icon: Clock,
    content: 'We may update these terms periodically. Material changes are communicated via email and platform notification at least 14 days before taking effect. Continued use after changes constitutes acceptance. The latest version is always available at shiarishta.com/terms.'
  },
  {
    id: 'governing',
    title: '11. Governing Law',
    icon: Scale,
    content: 'These terms are governed by the laws of the State of Michigan, USA. Any disputes shall be resolved in the courts of Washtenaw County, Michigan. You agree to submit to the exclusive jurisdiction of these courts.'
  },
];

export default function Terms() {
  return (
    <Layout>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Legal</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-2">Terms of Service</h1>
          <p className="text-muted mt-2">Last updated: August 2026</p>
          <p className="text-sm text-muted mt-4 max-w-2xl mx-auto">
            Please read these terms carefully. They govern your use of Shia Rishta and outline our shared commitments.
          </p>
        </motion.div>

        <div className="space-y-6">
          {sections.map((section, i) => (
            <motion.div key={section.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="bg-elevated rounded-2xl border border-line/20 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><section.icon className="w-5 h-5 text-primary" /></span>
                <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              </div>
              <p className="text-sm text-muted leading-relaxed">{section.content}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 p-6 rounded-2xl bg-elevated border border-line/20 text-center">
          <p className="text-sm text-muted">Questions about these terms? Contact us at <a href="mailto:legal@shiarishta.com" className="text-primary hover:underline">legal@shiarishta.com</a>.</p>
        </div>
      </main>
    </Layout>
  );
}
