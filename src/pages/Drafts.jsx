import { useEffect, useState } from 'react';
import { Copy, Check, Send, Clock, Trash2, ExternalLink, HandHeart, MessageCircle } from 'lucide-react';
import Layout from '@/layouts/MainLayout';
import { useToast } from '@lib/useToast';
import { introductions } from '../lib/api/introductions';
import { usePageTitle } from '../lib/usePageTitle';

// Introductions dashboard — for verified matchmakers and guardians. A draft is
// a PRIVATE invitation, never a profile: she gets a one-time link (their
// WhatsApp, their relationship, our consent trail), reviews it, and claims it
// as her own account. Quota grows as her invitations are accepted.
export default function Drafts() {
  usePageTitle('Introductions');
  const [caps, setCaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [copied, setCopied] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank());
  const { addToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const c = await introductions.capabilities();
      setCaps(c);
      if (c.canDraft) setDrafts(await introductions.mine());
    } catch (e) {
      addToast(e.message || 'Could not load introductions.', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await introductions.create({
        gender: form.gender,
        relationship: form.relationship,
        displayName: form.displayName,
        age: form.age === '' ? undefined : Number(form.age),
        city: form.city, country: form.country, sect: form.sect, profession: form.profession,
        bio: form.bio, expectations: form.expectations, aboutFamily: form.aboutFamily,
        contactEmail: form.contactEmail, contactPhone: form.contactPhone,
        consentAttested: form.consentAttested === true,
      });
      setForm(blank());
      await load();
      addToast(`Draft created — valid until ${new Date(res.draft.expiresAt).toLocaleDateString()}. Send ${res.draft.displayName} her link.`, 'success');
      copy(res.shareUrl, res.draft.shortCode);
    } catch (err) {
      addToast(err.message || 'Could not create the draft.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      addToast(okMsg, 'success');
      load();
    } catch (e) {
      addToast(e.message || 'Action failed.', 'error');
    }
  };

  const copy = async (url, code) => {
    try { await navigator.clipboard.writeText(url); setCopied(code); setTimeout(() => setCopied(''), 2500); } catch { /* clipboard blocked — the URL is visible below */ }
  };

  const whatsapp = (d) => `https://wa.me/?text=${encodeURIComponent(
    `Assalamu Alaikum — I have set up a private profile for you on Shia Rishta (nikah-first matchmaking). Review it and make it yours here: ${window.location.origin}/claim/${d.claim_token}\n\nShort code if the link expires: ${d.short_code}`,
  )}`;

  const quota = caps?.quota || { open: 0, limit: 0, claimed: 0 };

  return (
    <Layout>
      <main>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1>Introductions</h1>
          {caps?.role === 'matchmaker' && <span className="verified-pill" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>Matchmaker · women only</span>}
          {caps?.role === 'guardian' && <span className="verified-pill" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>Guardian · family drafts</span>}
        </div>
        <p>
          You create a <strong>private draft</strong> — never a public profile. She receives a one-time link, reviews everything you wrote,
          and claims it as her own account (her photo, her edits, her consent). Declined or expired drafts are erased.
        </p>

        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : !caps?.canDraft ? (
          <div className="empty-state">
            <p><HandHeart style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />Introductions are for verified matchmakers and guardians.</p>
            <p style={{ marginTop: 4 }}>Ask an admin to grant your account the matchmaker or guardian role, then come back.</p>
          </div>
        ) : (
          <>
            <Quota quota={quota} role={caps.role} />
            <CreateForm form={form} set={set} submit={create} busy={creating} role={caps.role} />
            <DraftsList drafts={drafts} copied={copied} copy={copy} whatsapp={whatsapp} act={act} />
          </>
        )}
      </main>
    </Layout>
  );
}

function blank() {
  return { gender: 'female', relationship: '', displayName: '', age: '', city: '', country: '', sect: '', profession: '', bio: '', expectations: '', aboutFamily: '', contactEmail: '', contactPhone: '', consentAttested: false };
}

// Quota: open drafts vs current limit. Claimed introductions raise the limit —
// acceptance, not payment, buys more slots.
function Quota({ quota, role }) {
  const pct = quota.limit ? Math.min(100, Math.round((quota.open / quota.limit) * 100)) : 0;
  return (
    <div className="settings-list" style={{ marginBottom: 24 }}>
      <div className="toggle-row">
        <div>
          <strong>Your open invitations</strong>
          <br />
          <small>Each claimed introduction raises your limit by 5 — your acceptance rate is your reputation.</small>
        </div>
        <div style={{ textAlign: 'right', minWidth: 140 }}>
          <strong>{quota.open} / {quota.limit}</strong>
          <div style={{ height: 6, borderRadius: 4, background: 'var(--color-border)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--color-danger)' : 'var(--color-primary)' }} />
          </div>
        </div>
      </div>
      {role === 'guardian' && (
        <div className="toggle-row">
          <div><strong>Family drafts</strong><br /><small>You may introduce male family members (son, nephew, brother…). State your relationship on each.</small></div>
        </div>
      )}
    </div>
  );
}

// Create form — scoped by role server-side; the matchmaker cannot draft men,
// the guardian must state the relationship, everyone must attest consent.
function CreateForm({ form, set, submit, busy, role }) {
  const femaleOnly = role === 'matchmaker';
  const input = { background: 'var(--color-surface)', borderColor: 'var(--color-border)' };
  const labelCls = 'block mb-1.5 text-sm font-medium';
  const labelStyle = { color: 'var(--color-ink-secondary)' };
  return (
    <form onSubmit={submit} className="settings-list" style={{ marginBottom: 24 }}>
      <div className="toggle-row"><div><strong>New introduction draft</strong><br /><small>Everything here is shown to her for review before she claims it. Be honest and kind.</small></div></div>

      <div className="toggle-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <div>
            <label className={labelCls} style={labelStyle}>Profile for</label>
            <select value={form.gender} onChange={set('gender')} disabled={femaleOnly} className="input w-full" style={input} aria-label="Gender">
              <option value="female">A woman</option>
              {!femaleOnly && <option value="male">A man (family only)</option>}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Full name *</label>
            <input required value={form.displayName} onChange={set('displayName')} className="input w-full" style={input} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Age (18+)</label>
            <input type="number" min={18} max={100} value={form.age} onChange={set('age')} className="input w-full" style={input} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>City</label>
            <input value={form.city} onChange={set('city')} className="input w-full" style={input} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Country</label>
            <input value={form.country} onChange={set('country')} className="input w-full" style={input} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Sect</label>
            <input value={form.sect} onChange={set('sect')} placeholder="Ithna Ashari…" className="input w-full" style={input} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Profession</label>
            <input value={form.profession} onChange={set('profession')} className="input w-full" style={input} />
          </div>
          {role === 'guardian' && (
            <div>
              <label className={labelCls} style={labelStyle}>Your relationship *</label>
              <input required value={form.relationship} onChange={set('relationship')} placeholder="son, nephew, sister…" className="input w-full" style={input} />
            </div>
          )}
        </div>
      </div>

      <div className="toggle-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'grid', gap: 12 }}>
          <div>
            <label className={labelCls} style={labelStyle}>About me (max 2000)</label>
            <textarea value={form.bio} onChange={set('bio')} maxLength={2000} rows={3} className="input w-full" style={{ ...input, resize: 'vertical' }} placeholder="Character, deen, work, family in her own words…" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Expectations (max 2000)</label>
            <textarea value={form.expectations} onChange={set('expectations')} maxLength={2000} rows={3} className="input w-full" style={{ ...input, resize: 'vertical' }} placeholder="What she is looking for in a spouse…" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>About family (max 1000)</label>
            <textarea value={form.aboutFamily} onChange={set('aboutFamily')} maxLength={1000} rows={2} className="input w-full" style={{ ...input, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <div>
              <label className={labelCls} style={labelStyle}>Her email (invitation goes here) *</label>
              <input type="email" required value={form.contactEmail} onChange={set('contactEmail')} className="input w-full" style={input} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Her phone / WhatsApp (optional)</label>
              <input value={form.contactPhone} onChange={set('contactPhone')} className="input w-full" style={input} />
            </div>
          </div>
        </div>
      </div>

      <div className="toggle-row">
        <div>
          <strong>Consent attestation *</strong>
          <br />
          <small>You confirm she agreed to share these contact details on Shia Rishta. Recorded with your name and timestamp, auditable.</small>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.consentAttested === true} onChange={(e) => set('consentAttested')({ target: { value: e.target.checked } })} style={{ width: 18, height: 18 }} />
          <span className="text-sm font-medium">She agreed</span>
        </label>
      </div>

      <div className="toggle-row">
        <button type="submit" disabled={busy || !form.consentAttested} className="button primary px-5 py-2.5 font-semibold">
          {busy ? 'Creating…' : 'Create draft & get her link'}
        </button>
      </div>

    </form>
  );
}

// My drafts: share link + WhatsApp + platform email, extend for busy people,
// withdraw with a scrub. Claimed rows become receipts, not control.
function DraftsList({ drafts, copied, copy, whatsapp, act }) {
  if (!drafts.length) {
    return (
      <div className="empty-state">
        <p>No introductions yet.</p>
        <p style={{ marginTop: 4 }}>Create your first draft above — she gets a private link, not a public profile.</p>
      </div>
    );
  }
  const statusPill = (s) => ({
    awaiting_claim: { bg: 'var(--color-primary-subtle)', fg: 'var(--color-primary)', label: 'Awaiting her' },
    claimed: { bg: 'rgba(16,185,129,.12)', fg: 'var(--color-success)', label: 'Claimed by her' },
    declined: { bg: 'var(--color-danger-subtle)', fg: 'var(--color-danger)', label: 'Declined — erased' },
    expired: { bg: 'var(--color-border)', fg: 'var(--color-ink-faint)', label: 'Expired' },
  }[s] || { bg: 'var(--color-border)', fg: 'var(--color-ink-faint)', label: s });

  return (
    <div className="settings-list">
      {drafts.map((d) => {
        const pill = statusPill(d.status);
        const shareUrl = d.shareUrl || `${window.location.origin}/claim/${d.claim_token || ''}`;
        const live = d.status === 'awaiting_claim';
        return (
          <div key={d.id} className="toggle-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{d.display_name}</strong>
                <span className="verified-pill" style={{ background: pill.bg, color: pill.fg }}>{pill.label}</span>
                {d.gender === 'female' ? <small style={{ color: 'var(--color-ink-faint)' }}>her</small> : <small style={{ color: 'var(--color-ink-faint)' }}>his · {d.short_code}</small>}
              </div>
              <small style={{ color: 'var(--color-ink-secondary)', display: 'block', marginTop: 4 }}>
                {[d.city, d.country].filter(Boolean).join(', ') || '—'}
                {d.send_count ? ` · emailed ${d.send_count}×` : ''}
                {d.claimed_at ? ` · claimed ${new Date(d.claimed_at).toLocaleDateString()}` : ''}
                {d.declined_at ? ` · declined ${new Date(d.declined_at).toLocaleDateString()}` : ''}
                {live ? ` · expires ${d.claim_token_expires ? new Date(d.claim_token_expires).toLocaleDateString() : '—'}` : ''}
              </small>
              {live && (
                <code style={{ display: 'block', marginTop: 8, fontSize: '0.72rem', wordBreak: 'break-all', color: 'var(--color-ink-faint)' }}>{shareUrl}</code>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {live && (
                <>
                  <button onClick={() => copy(shareUrl, d.short_code)} className="button px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    {copied === d.short_code ? <Check className="w-3.5 h-3.5" style={{ display: 'inline' }} /> : <Copy className="w-3.5 h-3.5" style={{ display: 'inline' }} />} {copied === d.short_code ? 'Copied' : 'Copy link'}
                  </button>
                  <a href={whatsapp(d)} target="_blank" rel="noreferrer" className="button primary px-3 py-1.5 text-xs font-semibold" style={{ textDecoration: 'none' }}>
                    <MessageCircle className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-3px' }} /> WhatsApp
                  </a>
                  <button onClick={() => act(() => introductions.sendInvite(d.id), `Invitation emailed to ${d.contact_email}.`)} className="button px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    <Send className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-3px' }} /> Email
                  </button>
                  <button onClick={() => act(() => introductions.extend(d.id), 'Extended — she has a fresh window from today.')} className="button px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} title="Fresh window for busy people">
                    <Clock className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-3px' }} /> Extend
                  </button>
                  <button onClick={() => act(() => introductions.withdraw(d.id), 'Draft withdrawn — her details are scrubbed.')} className="button px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-danger)' }} title="Withdraw and scrub">
                    <Trash2 className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-3px' }} />
                  </button>
                </>
              )}
              {d.status === 'expired' && (
                <button onClick={() => act(() => introductions.extend(d.id), 'Extended — she has a fresh window from today.')} className="button primary px-3 py-1.5 text-xs font-semibold">
                  <ExternalLink className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: '-3px' }} /> Revive with extension
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


