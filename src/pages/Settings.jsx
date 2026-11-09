import { usePageTitle } from '../lib/usePageTitle';
import { useState, useEffect } from 'react';
import { readIsDark, writeIsDark, applyIsDark } from '../lib/theme';
import Layout from '../layouts/MainLayout';
import { useAuth } from '../lib/auth/AuthContext';
import GetVerified from '../components/GetVerified';
import PhotoUpload from '../components/PhotoUpload';
import WaliLinks from '../components/WaliLinks';
import ConfirmDialog from '../components/ConfirmDialog';
import { DELETION_REASONS } from '../lib/api/safety';
import {
  Shield, Bell, User, Lock, Moon, Sun, AlertTriangle
} from 'lucide-react';

// Hide-any-field (2026-11-09): every user-provided profile detail, grouped
// by onboarding section. Keys are the payload keys visibleProfile() returns
// ('heightCm' for height, 'children' for children status, 'expectations'
// for "what I'm looking for"). Shown by default; a field in `hiddenFields`
// is omitted from the card and detail page for other viewers — but the
// stored value is still used for matching and filters. Not hideable:
// display name, verification badges, the guardian badge, the photo (it has
// its own visibility tiers). Marja is never displayed at all, so it has no
// toggle. Citizenship has no display surface yet (it is collected but never
// stored) — its toggle is listed and harmless until that field is stored.
const HIDEABLE_FIELDS = [
  { section: 'Basics', fields: [
    { key: 'age', label: 'Age' },
    { key: 'gender', label: 'Gender' },
    { key: 'seekingGender', label: "Who I'm seeking" },
    { key: 'heightCm', label: 'Height' },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: 'maritalStatus', label: 'Marital status' },
  ] },
  { section: 'Faith', fields: [
    { key: 'sect', label: 'Sect' },
    { key: 'religiosity', label: 'Religiosity' },
    { key: 'prayer', label: 'Prayer' },
    { key: 'modesty', label: 'Modesty' },
    { key: 'diet', label: 'Diet' },
  ] },
  { section: 'Background', fields: [
    { key: 'syedStatus', label: 'Syed / Sadat status' },
    { key: 'ethnicity', label: 'Ethnicity' },
    { key: 'subEthnicity', label: 'Sub-ethnicity' },
    { key: 'languages', label: 'Languages' },
    { key: 'citizenships', label: 'Citizenship' },
  ] },
  { section: 'Career', fields: [
    { key: 'educationLevel', label: 'Education' },
    { key: 'profession', label: 'Profession' },
    { key: 'incomeRange', label: 'Income range' },
  ] },
  { section: 'Intentions', fields: [
    { key: 'timeline', label: 'Nikah timeline' },
    { key: 'relocation', label: 'Willing to relocate' },
    { key: 'familyInvolvement', label: 'Family involvement' },
    { key: 'children', label: 'Children' },
    { key: 'childrenPlans', label: 'Plans for children' },
  ] },
  { section: 'Story', fields: [
    { key: 'bio', label: 'About me (bio)' },
    { key: 'expectations', label: "What I'm looking for" },
    { key: 'aboutFamily', label: 'About my family' },
  ] },
];

// Settings are per-member: the key follows the signed-in account
// (sh_session.uid), never the bare browser. Two accounts on one browser must
// never read each other's privacy choices. Same-device preferences only —
// nothing here claims server enforcement.
const SETTINGS_BASE = 'shiarishta_settings';
function settingsKey() {
  try {
    const raw = localStorage.getItem('sh_session');
    const uid = raw ? JSON.parse(raw)?.uid : null;
    return uid ? `${SETTINGS_BASE}::${uid}` : SETTINGS_BASE;
  } catch {
    return SETTINGS_BASE;
  }
}

export default function Settings() {
  usePageTitle('Settings');
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [theme, setTheme] = useState(readIsDark() ? 'dark' : 'light');

  // Public handle — the member-chosen username (e.g. "zainab.h") they can be
  // addressed by. Optional; enforced unique server-side.
  const [username, setUsername] = useState('');
  const [usernameNote, setUsernameNote] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  // Load the current handle once so the field is not blank for members who
  // already set one. The same owner payload carries the server truth for the
  // privacy toggles, the location/phone fields and the blocked list — Settings
  // used to show localStorage defaults for all of them (2026-11-09, P0 batch).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import('../lib/api/client');
        const me = await api.getProfile(user?.uid);
        if (cancelled || !me) return;
        setProfileLoaded(true);
        if (me?.username) setUsername(me.username);
        // Hidden profile details (2026-11-09): the owner payload carries
        // `hiddenFields` — the list this member chose to hide.
        if (Array.isArray(me?.hiddenFields)) setHiddenFields(me.hiddenFields);
        setProfile((pp) => ({
          ...pp,
          city: typeof me.city === 'string' ? me.city : pp.city,
          country: typeof me.country === 'string' ? me.country : pp.country,
          phone: typeof me.contactPhone === 'string' ? me.contactPhone : pp.phone,
        }));
        setPrivacy((p) => ({
          ...p,
          profileVisibility: me.visibility || p.profileVisibility,
          photoVisibility: me.photosVisibility || p.photoVisibility,
          contactVisibility: me.contactVisibility || p.contactVisibility,
          blockUnverified: typeof me.blockUnverified === 'boolean' ? me.blockUnverified : p.blockUnverified,
          allowFamilyView: typeof me.allowFamilyView === 'boolean' ? me.allowFamilyView : p.allowFamilyView,
        }));
      } catch { /* leave blank — a missing handle is not an error */ }
      try {
        const { listBlocks } = await import('../lib/api/safety');
        const list = await listBlocks().catch(() => []);
        if (!cancelled && Array.isArray(list)) setBlocks(list);
      } catch { /* blocked list is best-effort on load */ }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const saveUsername = async () => {
    const value = username.trim();
    // Mirror the server rule so the member gets an answer before a round-trip.
    if (value && !/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(value)) {
      setUsernameNote('Use 3–32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.');
      return;
    }
    setUsernameSaving(true);
    setUsernameNote('');
    try {
      const { api } = await import('../lib/api/client');
      await api.updateProfile(user?.uid, { username: value });
      setUsernameNote(value ? `Saved — other members can now use @${value}.` : 'Handle removed.');
    } catch (e) {
      setUsernameNote(e?.message || 'Could not save your username.');
    } finally {
      setUsernameSaving(false);
    }
  };

  // Account identity (display name / email) — PUT /api/users/me, defensive 404.
  const [accountSaved, setAccountSaved] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  // Security — active sessions list, defensive 404.
  const [sessions, setSessions] = useState(null); // null = not loaded yet
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsNote, setSessionsNote] = useState('');

  // Data export
  const [exporting, setExporting] = useState(false);

  const saveAccountIdentity = async () => {
    setAccountSaved('');
    setAccountSaving(true);
    try {
      const { http } = await import('../lib/api/transport');
      const payload = {};
      if (profile.displayName.trim()) payload.displayName = profile.displayName.trim();
      if (profile.email.trim() && profile.email.trim() !== (user?.email || '')) {
        payload.email = profile.email.trim();
      }
      if (!payload.displayName && !payload.email) {
        setAccountSaved('Nothing to change.');
        return;
      }
      await http.put('/api/users/me', payload);
      // Sync the cached session — otherwise the old displayName overwrites the
      // input on reload (the backend is correct; the localStorage copy was stale).
      if (payload.displayName) {
        try {
          const { auth } = await import('../lib/api/authService');
          const { write } = await import('../lib/api/storage');
          const sess = auth.current();
          if (sess) {
            sess.displayName = payload.displayName;
            write('session', sess);
          }
        } catch {
          // A failed cache write must not fail the save itself — the profile
          // already persisted server-side. The header simply shows the old
          // name until the next load.
        }
      }
      if (payload.email) {
        setAccountSaved('Saved. Verification required — check your inbox to confirm the new email address.');
      } else {
        setAccountSaved('Saved.');
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (/404/.test(msg)) {
        setAccountSaved('Account changes are not available yet — the server endpoint is still being deployed.');
      } else {
        setAccountSaved(msg || 'Could not save your changes.');
      }
    } finally {
      setAccountSaving(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsNote('');
    try {
      const { http } = await import('../lib/api/transport');
      const data = await http.get('/api/auth/sessions');
      setSessions(Array.isArray(data?.sessions) ? data.sessions : (Array.isArray(data) ? data : []));
    } catch (e) {
      const msg = String(e?.message || '');
      if (/404/.test(msg)) {
        setSessionsNote('Session listing is not available yet — the server endpoint is still being deployed. This session remains signed in on this device.');
      } else {
        setSessionsNote(msg || 'Could not load sessions.');
      }
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const { http } = await import('../lib/api/transport');
      const collected = { exported_at: new Date().toISOString(), sources: {} };
      const endpoints = {
        profile: '/api/profiles/me',
        interests_received: '/api/profiles/interests/received',
        conversations: '/api/messages',
        drafts: '/api/drafts/mine',
        sessions: '/api/auth/sessions',
      };
      await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
        try {
          collected.sources[key] = await http.get(path);
        } catch (e) {
          collected.sources[key] = { unavailable: String(e?.message || 'error') };
        }
      }));
      collected.sources.local_settings = (() => {
        try {
          const raw = localStorage.getItem(settingsKey());
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })();
      // Human-readable: 2-space indentation, one line per field.
      const blob = new Blob([JSON.stringify(collected, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shiarishta-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    email: user?.email || '',
    phone: '', city: '', country: '', bio: ''
  });
  // True once the owner profile has loaded from the server. The Save button
  // stays disabled until then: the fields start blank, and sending blanks
  // would wipe the stored city/country/phone before they ever load.
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [privacy, setPrivacy] = useState({
    profileVisibility: 'members', photoVisibility: 'members',
    contactVisibility: 'members',
    // "Show online status" was removed (2026-11-09, P0 batch): no online
    // status is displayed anywhere in the product, so the toggle promised
    // a feature that did not exist. The two toggles below are enforced by
    // the server — blockUnverified hides your profile from unverified
    // members and blocks their interest; allowFamilyView gates wali links.
    allowFamilyView: true, blockUnverified: false
  });
  const [privacySaved, setPrivacySaved] = useState('');
  // Hide-any-field (2026-11-09): payload keys the member wants hidden from
  // other viewers. Empty = everything shown (the default).
  const [hiddenFields, setHiddenFields] = useState([]);
  const toggleHiddenField = (key) => {
    setHiddenFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const [blocks, setBlocks] = useState([]);
  const [blocking, setBlocking] = useState('');
  const [blockError, setBlockError] = useState('');
  const [blockSuccess, setBlockSuccess] = useState('');
  const [confirmBlockId, setConfirmBlockId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Exit survey — optional, one tap to skip (confirm without answering).
  // Sent with the delete request so the reason is recorded before the
  // account is wiped; the admin "Deleted profiles" page reads it back.
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteDetail, setDeleteDetail] = useState('');

  const [notifications, setNotifications] = useState({
    emailMessages: true, emailMatches: true, emailWeeklyDigest: true,
    pushMessages: true, pushMatches: false, pushProfileViews: false
  });

  const [twoFactor, setTwoFactor] = useState(false);

  useEffect(() => {
    const savedSettings = localStorage.getItem(settingsKey());
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (parsed.privacy) setPrivacy(prev => ({ ...prev, ...parsed.privacy }));
        if (parsed.notifications) setNotifications(prev => ({ ...prev, ...parsed.notifications }));
        if (parsed.profile) setProfile(prev => ({ ...prev, ...parsed.profile, email: user?.email || '', displayName: prev.displayName || user?.displayName || '' }));
        if (parsed.twoFactor) setTwoFactor(parsed.twoFactor);
      } catch { /* corrupted — ignore */ }
    }
  }, [user?.email]);

  const handleSave = async () => {
    localStorage.setItem(settingsKey(), JSON.stringify({ privacy, notifications, profile, twoFactor }));
    // Appearance is global to this browser, not per member: every layout reads
    // the same versioned key through lib/theme.
    writeIsDark(theme === 'dark');
    applyIsDark(theme === 'dark');
    // The bio textarea used to be decorative (uncontrolled, never sent
    // anywhere). Persist it to the server profile so Save actually saves —
    // along with the city, country and phone, which used to be written to
    // localStorage only (2026-11-09, P0 batch).
    setSaveError('');
    if (!profileLoaded) {
      setSaveError('Still loading your profile — try again in a moment.');
      return;
    }
    setBioSaving(true);
    try {
      const { api } = await import('../lib/api/client');
      await api.updateProfile('me', {
        bio: profile.bio,
        city: profile.city,
        country: profile.country,
        contactPhone: profile.phone,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e.message || 'Could not save your profile.');
      setSaved(false);
    } finally {
      setBioSaving(false);
      setTimeout(() => { setSaved(false); setSaveError(''); }, 4000);
    }
  };

  // Populate the bio from the server profile on mount, so the field shows the
  // real saved value instead of a blank box.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import('../lib/api/client');
        const me = await api.getProfile('me');
        if (!cancelled && me && typeof me.bio === 'string') {
          setProfile((pp) => ({ ...pp, bio: me.bio }));
        }
      } catch { /* profile may not exist yet — non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User, desc: 'Personal information' },
    { id: 'privacy', label: 'Privacy & Safety', icon: Shield, desc: 'Control who sees what' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'How you stay informed' },
    { id: 'appearance', label: 'Appearance', icon: Moon, desc: 'Theme and display' },
    { id: 'security', label: 'Security', icon: Lock, desc: 'Password and 2FA' },
    { id: 'account', label: 'Account', icon: AlertTriangle, desc: 'Data and deletion' }
  ];

  const inputCls = 'w-full px-4 py-3 rounded-xl border border-line/30 bg-elevated text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all';
  void inputCls;

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink">Settings</h1>
          <p className="text-muted mt-1">Manage your account and preferences.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="bg-elevated rounded-xl border border-line/20 p-2 space-y-1">
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${activeTab === tab.id ? 'btn btn-primary' : 'btn btn-ghost'}`}>
                  <TabIcon className="w-4 h-4" /> {tab.label}
                </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 bg-elevated rounded-xl border border-line/20 shadow-sm p-8">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Profile Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div><label htmlFor="displayName" className="text-sm font-medium text-muted mb-1.5 block">Display Name</label>
                     <input id="displayName" type="text" value={profile.displayName} onChange={e => setProfile(pp => ({ ...pp, displayName: e.target.value }))} className="input w-full" aria-label="Display name" />
                   </div>
                   <div><label htmlFor="settings-email" className="text-sm font-medium text-muted mb-1.5 block">Email</label>
                     <input id="settings-email" type="email" value={profile.email} onChange={e => setProfile(pp => ({ ...pp, email: e.target.value }))} className="input w-full" aria-label="Email" />
                   </div>
                </div>
                <p className="text-xs text-muted">Changing your email requires verification — a confirmation link will be sent to the new address.</p>
                <div>
                  <button
                    onClick={saveAccountIdentity}
                    disabled={accountSaving}
                    className="button primary px-5 py-2 font-semibold text-sm"
                  >
                    {accountSaving ? 'Saving…' : 'Save name & email'}
                  </button>
                  {accountSaved && <p className="text-sm mt-2" style={{ color: 'var(--color-ink-secondary)' }}>{accountSaved}</p>}
                </div>

                {/* Public handle. Optional — a member can be addressed by their
                    display name alone. Kept separate from Display Name because
                    it is the part meant to be published and shared. */}
                <div>
                  <label htmlFor="settings-username" className="text-sm font-medium text-muted mb-1.5 block">
                    Username
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="settings-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. zainab.h"
                      className="input flex-1 min-w-[180px]"
                      aria-label="Username"
                      aria-describedby="settings-username-help"
                    />
                    <button
                      onClick={saveUsername}
                      disabled={usernameSaving}
                      className="button px-5 py-2 font-semibold text-sm"
                    >
                      {usernameSaving ? 'Saving…' : 'Save username'}
                    </button>
                  </div>
                  <p id="settings-username-help" className="text-xs text-muted mt-1.5">
                    Optional. 3–32 characters — letters, numbers, dots, dashes or underscores.
                    Must be unique across the platform.
                  </p>
                  {usernameNote && (
                    <p className="text-sm mt-2" style={{ color: 'var(--color-ink-secondary)' }}>{usernameNote}</p>
                  )}
                </div>
                <div><label htmlFor="settings-bio" className="text-sm font-medium text-muted mb-1.5 block">Bio</label>
                  <textarea id="settings-bio" rows={4} value={profile.bio} onChange={e => setProfile(pp => ({ ...pp, bio: e.target.value }))} placeholder="Tell others about yourself..." className="input w-full resize-none" aria-label="Bio" />
                </div>
                {/* Location and phone (2026-11-09, P0 batch): these fields
                    existed in state but had no inputs and never reached the
                    server — "Save account changes" saved only the bio. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label htmlFor="settings-city" className="text-sm font-medium text-muted mb-1.5 block">City</label>
                    <input id="settings-city" type="text" value={profile.city} onChange={e => setProfile(pp => ({ ...pp, city: e.target.value }))} className="input w-full" aria-label="City" placeholder="e.g. Baltimore" />
                  </div>
                  <div><label htmlFor="settings-country" className="text-sm font-medium text-muted mb-1.5 block">Country</label>
                    <input id="settings-country" type="text" value={profile.country} onChange={e => setProfile(pp => ({ ...pp, country: e.target.value }))} className="input w-full" aria-label="Country" placeholder="e.g. United States" />
                  </div>
                  <div><label htmlFor="settings-phone" className="text-sm font-medium text-muted mb-1.5 block">Phone</label>
                    <input id="settings-phone" type="tel" value={profile.phone} onChange={e => setProfile(pp => ({ ...pp, phone: e.target.value }))} className="input w-full" aria-label="Phone" placeholder="Optional" />
                    <p className="text-xs text-muted mt-1">Shown only to members your contact visibility allows.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Privacy & Safety</h2>
                <p className="text-sm text-muted">Enforced by the server on Save — not just hidden in your browser. Photos set to Private are never sent to other members.</p>
                {[
                  { key: 'profileVisibility', label: 'Who can see my profile', type: 'select', options: [{ v: 'public', l: 'Public — anyone' }, { v: 'members', l: 'Members only' }, { v: 'private', l: 'Private — only me' }] },
                  { key: 'photoVisibility', label: 'Who can see my photos', type: 'select', options: [{ v: 'public', l: 'Public — anyone' }, { v: 'members', l: 'Members only' }, { v: 'private', l: 'Private — only me' }] },
                  { key: 'contactVisibility', label: 'Who can see my contact details', hint: 'Your phone number and email shown on your profile', type: 'select', options: [{ v: 'public', l: 'Public — anyone' }, { v: 'members', l: 'Members only' }, { v: 'private', l: 'Private — only me' }] },
                  { key: 'allowFamilyView', label: 'Allow family members to view profile', hint: 'Wali view links stop working while this is off', type: 'toggle' },
                  { key: 'blockUnverified', label: 'Block unverified members', hint: 'Members whose email is not verified cannot see your profile or send interest', type: 'toggle' }
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-line/10 last:border-0">
                    <span className="text-sm font-medium text-ink">
                      {item.label}
                      {item.hint && <span className="block text-xs font-normal text-muted mt-0.5">{item.hint}</span>}
                    </span>
                    {item.type === 'toggle' ? (
                      <button onClick={() => setPrivacy(p => ({ ...p, [item.key]: !p[item.key] }))} className={`relative h-6 w-11 flex items-center transition-all duration-200 ${privacy[item.key] ? 'btn btn-primary' : 'btn btn-ghost'} `}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${privacy[item.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    ) : (
                      <select value={privacy[item.key]} onChange={e => setPrivacy(p => ({ ...p, [item.key]: e.target.value }))} className="input w-full">
                        {item.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {/* Hide-any-field (2026-11-09): every profile detail can be
                    hidden from other members. Toggle on = shown (the
                    default); toggle off = hidden from the card and detail
                    page for everyone but you. The stored value is still
                    used for matching and filters. Saved by the same button
                    below, alongside the other privacy settings. */}
                <div className="pt-4 border-t border-line/10">
                  <h3 className="text-base font-semibold text-ink mb-1">Choose what to show</h3>
                  <p className="text-sm text-muted mb-3">
                    Everything is shown by default. Turn a detail off and other members will not see it on your card or profile — it is still used for matching and filters, and you always see your own full profile.
                  </p>
                  {HIDEABLE_FIELDS.map(group => (
                    <div key={group.section} className="mb-4">
                      <p className="text-xs uppercase tracking-wider font-bold text-muted mb-1">{group.section}</p>
                      {group.fields.map(f => {
                        const hidden = hiddenFields.includes(f.key);
                        return (
                          <div key={f.key} className="flex items-center justify-between py-2.5 border-b border-line/10 last:border-0">
                            <span className="text-sm font-medium text-ink">
                              {f.label}
                              <span className="block text-xs font-normal text-muted mt-0.5">
                                {hidden ? 'Hidden from other members' : 'Shown to other members'}
                                {f.hint ? ` — ${f.hint}` : ''}
                              </span>
                            </span>
                            <button onClick={() => toggleHiddenField(f.key)} aria-pressed={!hidden} aria-label={`${hidden ? 'Show' : 'Hide'} ${f.label}`} className={`relative h-6 w-11 flex items-center transition-all duration-200 ${!hidden ? 'btn btn-primary' : 'btn btn-ghost'} `}>
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${!hidden ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    setPrivacySaved('');
                    try {
                      const { api } = await import('../lib/api/client');
                      await api.updateProfile(user?.uid || 'me', {
                        visibility: privacy.profileVisibility,
                        photos_visibility: privacy.photoVisibility,
                        // Server normalizes these through the same visibility
                        // vocabulary as profile/photos (public/members/private).
                        contact_visibility: privacy.contactVisibility,
                        contactVisibility: privacy.contactVisibility,
                        // Privacy toggles (2026-11-09, P0 batch): enforced by
                        // the server — blockUnverified hides the profile from
                        // unverified members, allowFamilyView gates wali links.
                        blockUnverified: privacy.blockUnverified,
                        allowFamilyView: privacy.allowFamilyView,
                        // Hide-any-field (2026-11-09): the list of payload
                        // keys to omit for other viewers.
                        hiddenFields,
                      });
                      setPrivacySaved('Privacy saved — enforced for every other member.');
                    } catch (e) {
                      setPrivacySaved(e.message || 'Could not save privacy.');
                    }
                  }}
                  className="button primary px-5 py-2 font-semibold text-sm"
                >
                  Save privacy settings
                </button>
                {privacySaved && <p className="text-sm text-success font-medium">{privacySaved}</p>}

                <div className="pt-4 border-t border-line/10">
                  <h3 className="text-base font-semibold text-ink mb-1">Your photo</h3>
                  <p className="text-sm text-muted mb-3">
                    JPEG, PNG or WebP, up to 5&nbsp;MB. Location data embedded in the
                    file (EXIF/GPS) is stripped before it is stored.
                  </p>
                  <PhotoUpload />
                  <label className="flex items-center gap-3 mt-3 text-sm">
                    <span className="font-medium text-ink">Who can see this photo</span>
                    <select
                      value={privacy.photoVisibility}
                      onChange={e => setPrivacy(p => ({ ...p, photoVisibility: e.target.value }))}
                      aria-label="Who can see your photo"
                      className="px-3 py-2 rounded-lg border border-line/30 bg-base text-sm text-ink">
                      <option value="public">Public — anyone</option>
                      <option value="members">Members only</option>
                      <option value="private">Private — only me</option>
                    </select>
                  </label>
                  <p className="text-xs text-muted mt-1.5">Applies when you press “Save privacy settings” above.</p>
                </div>

                <div className="pt-2 border-t border-line/10 mt-6">
                  <GetVerified />
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-ink mb-2">Blocked members</h3>
                  <p className="text-sm text-muted mb-3">Blocking hides you from each other and disables messaging both ways — immediately, on every device.</p>
                  <div className="flex gap-2 mb-3">
                    <input
                      value={blocking}
                      onChange={e => setBlocking(e.target.value)}
                      placeholder="Paste a member ID to block"
                      className="input flex-1"
                      aria-label="Member ID to block"
                    />
                    <button
                      onClick={() => {
                        setBlockError('');
                        setBlockSuccess('');
                        if (!blocking.trim()) {
                          setBlockError('Enter a member ID to block.');
                          return;
                        }
                        setConfirmBlockId(blocking.trim());
                      }}
                      className="button px-4 py-2 text-sm font-semibold"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
                    >
                      Block
                    </button>
                  </div>
                  {blockError && (
                    <div className="text-sm p-2 rounded-lg mb-3" role="alert" style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}>
                      {blockError}
                    </div>
                  )}
                  {blockSuccess && (
                    <div className="text-sm p-2 rounded-lg mb-3" role="status" style={{ background: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                      {blockSuccess}
                    </div>
                  )}
                  <ConfirmDialog
                    open={!!confirmBlockId}
                    title="Block this member?"
                    message="Blocking hides you from each other and disables messaging both ways — immediately, on every device. This can be undone later."
                    confirmLabel="Block member"
                    onCancel={() => setConfirmBlockId(null)}
                    onConfirm={async () => {
                      const id = confirmBlockId;
                      setConfirmBlockId(null);
                      try {
                        const { blockMember, listBlocks } = await import('../lib/api/safety');
                        await blockMember(id);
                        setBlocks(await listBlocks().catch(() => []));
                        setBlocking('');
                        setBlockSuccess('Member blocked.');
                      } catch (e) {
                        setBlockError((e && e.message) || 'Could not block this member. Please try again.');
                      }
                    }}
                  />
                  {blocks.length > 0 && (
                    <ul className="space-y-2">
                      {blocks.map(b => {
                        const bid = b.id || b;
                        const bname = b.displayName || 'Member';
                        return (
                          <li key={bid} className="flex items-center justify-between text-sm p-2 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                            <span style={{ color: 'var(--color-ink-secondary)' }}>{bname}</span>
                            <button
                              onClick={async () => {
                                const { unblockMember, listBlocks } = await import('../lib/api/safety');
                                await unblockMember(bid);
                                setBlocks(await listBlocks().catch(() => []));
                              }}
                              className="text-xs hover:underline"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              Unblock
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <WaliLinks />
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Notifications</h2>
                {[
                  { key: 'emailMessages', label: 'New messages (email)' },
                  { key: 'emailMatches', label: 'New matches (email)' },
                  { key: 'emailWeeklyDigest', label: 'Weekly activity digest' },
                  { key: 'pushMessages', label: 'New messages (push)' },
                  { key: 'pushMatches', label: 'New matches (push)' },
                  { key: 'pushProfileViews', label: 'Profile views (push)' }
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-line/10 last:border-0">
                    <span className="text-sm font-medium text-ink">{item.label}</span>
                    <button onClick={() => {
                      const next = { ...notifications, [item.key]: !notifications[item.key] };
                      setNotifications(next);
                      // The notifications tab has no save button, so a flip
                      // must persist immediately — otherwise it is lost on
                      // reload unless the member also saves from the Profile
                      // tab. (2026-11-09, P0 batch: the digest toggle also
                      // wrote a phantom key, `weeklyDigest`, that nothing
                      // read; the state key is `emailWeeklyDigest`.)
                      try { localStorage.setItem(settingsKey(), JSON.stringify({ privacy, notifications: next, profile, twoFactor })); } catch { /* storage full */ }
                    }} className={`relative h-6 w-11 flex items-center transition-all duration-200 ${notifications[item.key] ? 'btn btn-primary' : 'btn btn-ghost'} `}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Appearance</h2>
                <p className="text-sm text-muted">Applies to this browser immediately.</p>
                <div className="grid grid-cols-2 gap-4">
                  {[{ v: 'light', l: 'Light', icon: Sun }, { v: 'dark', l: 'Dark', icon: Moon }].map(opt => {
                    const OptIcon = opt.icon;
                    return (
                    <button key={opt.v} onClick={() => { setTheme(opt.v); writeIsDark(opt.v === 'dark'); applyIsDark(opt.v === 'dark'); }} className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${theme === opt.v ? 'btn btn-primary' : 'btn btn-ghost'} `}>
                      <OptIcon className={`w-6 h-6 ${theme === opt.v ? 'text-primary' : 'text-muted'}`} />
                      <span className={`text-sm font-medium ${theme === opt.v ? 'text-primary' : 'text-muted'}`}>{opt.l}</span>
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Security</h2>

                <div>
                  <h3 className="text-base font-semibold text-ink mb-2">Change password</h3>
                  <p className="text-sm text-muted mb-3">Use the forgot-password flow to reset your password securely via email.</p>
                  <a href="/auth/forgot" className="button secondary px-4 py-2 text-sm font-semibold inline-block">
                    Reset password
                  </a>
                </div>

                <div className="pt-4 border-t border-line/10">
                  <h3 className="text-base font-semibold text-ink mb-2">Active sessions</h3>
                  <p className="text-sm text-muted mb-3">
                    Every device signed in to <span className="font-medium text-ink">{user?.email}</span>.
                    If you don't recognize one, sign it out by changing your password.
                  </p>
                  {sessionsLoading ? (
                    <p className="text-sm text-muted">Loading sessions…</p>
                  ) : sessions === null ? (
                    <button onClick={loadSessions} className="button secondary px-4 py-2 text-sm font-semibold">
                      Load active sessions
                    </button>
                  ) : (
                    <ul className="space-y-2 mb-3">
                      {sessions.length === 0 ? (
                        <li className="text-sm text-muted">No sessions found.</li>
                      ) : sessions.map((s) => (
                        <li key={s.id || s.ip} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line/20" style={{ background: 'var(--color-surface)' }}>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">
                              {(s.userAgent || 'Unknown device').slice(0, 80)}
                              {s.current && (
                                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                                  THIS DEVICE
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              {[s.ip, s.lastSeen ? `Last seen ${new Date(s.lastSeen).toLocaleString()}` : (s.createdAt ? `Signed in ${new Date(s.createdAt).toLocaleString()}` : null)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sessionsNote && <p className="text-sm text-muted mb-3">{sessionsNote}</p>}
                  <button
                    onClick={() => { logout(); window.location.href = '/'; }}
                    className="button secondary px-4 py-2 text-sm font-semibold"
                  >
                    Sign out everywhere on this device
                  </button>
                </div>

                <div className="pt-4 border-t border-line/10">
                  <h3 className="text-base font-semibold text-ink mb-2">Protection</h3>
                  <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                    <li>Accounts lock after 5 failed sign-in attempts.</li>
                    <li>Sessions expire and must be renewed by signing in again.</li>
                    <li>We never ask for your password by email or message.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-ink">Account</h2>
                <div className="p-4 rounded-xl border border-line/20">
                  <h3 className="font-semibold text-ink">Export your data</h3>
                  <p className="text-sm text-muted mt-1 mb-3">
                    Download everything your account holds — account, profile, interests, conversations, and drafts — as human-readable JSON.
                  </p>
                  <button
                    onClick={exportData}
                    disabled={exporting}
                    className="button secondary px-4 py-2 text-sm font-semibold"
                  >
                    {exporting ? 'Preparing…' : 'Download my data (JSON)'}
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-danger/5 border border-danger/20">
                  <h3 className="font-semibold text-danger">Danger Zone</h3>
                  <p className="text-sm text-muted mt-1 mb-3">
                    Deleting your account permanently removes your profile, messages, interests, and all data. This cannot be undone.
                  </p>
                  <label htmlFor="delete-confirm" className="text-sm font-medium text-ink block mb-1.5">
                    Type <code className="px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>DELETE</code> to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    value={deleteConfirm}
                    onChange={e => { setDeleteConfirm(e.target.value); setDeleteError(''); }}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="input w-full max-w-xs mb-3"
                    aria-label="Type DELETE to confirm account deletion"
                  />
                  {deleteError && <p className="text-sm mb-3" role="alert" style={{ color: 'var(--color-danger)' }}>{deleteError}</p>}
                  <button
                    disabled={deleteConfirm !== 'DELETE' || deleteBusy}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40"
                    style={{ background: 'var(--color-danger)' }}
                  >
                    {deleteBusy ? 'Deleting…' : 'Delete my account'}
                  </button>
                  <ConfirmDialog
                    open={confirmDeleteOpen}
                    title="Permanently delete your account?"
                    message="This removes your profile, messages, interests, and all data. This cannot be undone."
                    confirmLabel="Yes, delete everything"
                    danger
                    busy={deleteBusy}
                    onCancel={() => setConfirmDeleteOpen(false)}
                    onConfirm={async () => {
                      setDeleteBusy(true);
                      setDeleteError('');
                      try {
                        const { deleteAccount } = await import('../lib/api/safety');
                        await deleteAccount({
                          reason: deleteReason || undefined,
                          detail: deleteDetail.trim() || undefined,
                        });
                        logout();
                        window.location.href = '/';
                      } catch (e) {
                        setDeleteError(e.message || 'Could not delete account.');
                      } finally {
                        setDeleteBusy(false);
                        setConfirmDeleteOpen(false);
                      }
                    }}
                  >
                    <p className="text-sm font-medium text-ink mb-2">
                      Before you go — mind telling us why? <span className="font-normal text-muted">(optional)</span>
                    </p>
                    <div role="radiogroup" aria-label="Why are you leaving?" className="space-y-1.5 mb-3">
                      {DELETION_REASONS.map((r) => (
                        <label key={r.key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                          <input
                            type="radio"
                            name="delete-reason"
                            value={r.key}
                            checked={deleteReason === r.key}
                            onChange={() => setDeleteReason(r.key)}
                            disabled={deleteBusy}
                          />
                          {r.label}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={deleteDetail}
                      onChange={(e) => setDeleteDetail(e.target.value)}
                      placeholder="Anything else you'd like us to know? (optional)"
                      rows={2}
                      maxLength={1000}
                      disabled={deleteBusy}
                      className="input w-full text-sm"
                      aria-label="Anything else you'd like us to know? (optional)"
                    />
                    <p className="text-xs text-muted mt-2">You can delete without answering — just press &ldquo;Yes, delete everything&rdquo;.</p>
                  </ConfirmDialog>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-line/10">
              {saved && <span className="text-sm text-success font-medium">Saved!</span>}
              {saveError && <span className="text-sm text-danger font-medium">{saveError}</span>}
              <button onClick={handleSave} disabled={bioSaving || !profileLoaded} className="button primary px-6 py-2.5 font-semibold disabled:opacity-50">{bioSaving ? 'Saving…' : 'Save account changes'}</button>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}