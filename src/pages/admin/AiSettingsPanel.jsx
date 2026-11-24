import { useState, useEffect, useCallback } from 'react';
import { http } from '@/lib/api/transport';
import { KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

/**
 * AI assistant connection panel — extracted from AdminContent (2026-11-23)
 * so the Settings page and the Content desk share ONE editor for the
 * NVIDIA credential instead of drifting copies.
 */
/**
 * AI credential panel.
 *
 * Lets an operator repair a broken NVIDIA key without shell access to the host.
 * The API only ever reports PRESENCE and SOURCE — never the stored value — so
 * this form is write-only by design: you can replace a key, you cannot read one
 * back. That matters because an admin session is exactly where a credential
 * would otherwise get copied into a screenshot or a browser cache.
 */
export default function AiSettingsPanel({ onChanged }) {
  const [status, setStatus] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await http.get('/api/admin/ai-settings'));
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not read AI settings.' });
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const save = async (e) => {
    e.preventDefault();
    const body = {};
    // An empty box means "leave it alone" — not "clear it". Clearing is an
    // explicit button so a stray keystroke can't wipe a working credential.
    if (keyInput.trim()) body.apiKey = keyInput.trim();
    if (modelInput.trim()) body.model = modelInput.trim();
    if (!Object.keys(body).length) {
      setMsg({ ok: false, text: 'Enter a key or a model id first.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await http.put('/api/admin/ai-settings', body);
      setKeyInput('');
      setModelInput('');
      setMsg({ ok: true, text: `Saved. Credential is now coming from ${res.source === 'admin-panel' ? 'this panel' : 'the environment'}.` });
      await loadStatus();
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await http.put('/api/admin/ai-settings', { apiKey: '' });
      setKeyInput('');
      setMsg({ ok: true, text: 'Panel key removed. Falling back to the environment variable.' });
      await loadStatus();
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not clear.' });
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      setVerifyResult(await http.post('/api/admin/ai-settings/verify', {}));
    } catch (e) {
      setVerifyResult({ ok: false, status: 0, detail: e?.message || 'Verification request failed.' });
    } finally {
      setVerifying(false);
      await loadStatus();
    }
  };

  const sourceTone = {
    'admin-panel': 'bg-success/10 text-success',
    environment: 'bg-warning/10 text-warning',
    missing: 'bg-danger/10 text-danger',
  };
  const sourceLabel = {
    'admin-panel': 'Configured here',
    environment: 'From environment',
    missing: 'Not configured',
  };

  return (
    <section className="rounded-xl border border-line/20 bg-elevated p-5 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" /> AI assistant connection
          </h2>
          <p className="text-xs text-muted">
            The assistant answers from retrieved platform facts even with no key, but content
            drafting needs a live model. Keys are encrypted at rest and can never be read back
            from this page.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-elevated text-muted border border-line/20 hover:border-line/40"
        >
          {open ? 'Hide' : 'Configure'}
        </button>
      </div>

      {/* Status line — always visible so a broken integration is diagnosable
          without opening the form. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className={`px-2 py-1 rounded-full font-semibold ${sourceTone[status?.source] || 'bg-hover text-muted'}`}>
          {status?.available ? (sourceLabel[status?.source] || 'Configured') : 'Not configured'}
        </span>
        {status?.masked && (
          <code className="px-2 py-1 rounded bg-hover text-muted" title="Stored key — write only">{status.masked}</code>
        )}
        <span className="text-muted">Model: <code className="text-ink">{status?.model || '—'}</code></span>
        {status?.keyFingerprint && (
          <span className="text-muted" title="SHA-256 prefix of the key currently in use. Not the key itself. After rotating a compromised key, this value must change.">
            Active key: <code className="text-ink">#{status.keyFingerprint}</code>
          </span>
        )}
        {status?.lastStatus && <span className="text-muted">Last check: {status.lastStatus}</span>}
        {!status?.available && (
          <span className="text-danger">
            Drafting is disabled. Paste a key below to turn it on.
          </span>
        )}
      </div>
      {open && (
        <AiSettingsForm
          status={status} keyInput={keyInput} setKeyInput={setKeyInput}
          modelInput={modelInput} setModelInput={setModelInput}
          saving={saving} verifying={verifying} verifyResult={verifyResult} msg={msg}
          onSave={save} onVerify={verify} onClear={clearKey}
        />
      )}
    </section>
  );
}


/** The expandable form half of AiSettingsPanel. Split out to keep each
 *  component readable, and so the status summary can render collapsed. */
function AiSettingsForm({ status, keyInput, setKeyInput, modelInput, setModelInput,
                          saving, verifying, verifyResult, msg, onSave, onVerify, onClear }) {
  return (
    <form onSubmit={onSave} className="mt-4 pt-4 border-t border-line/20 space-y-4">
      <div>
        <label htmlFor="ai-key" className="block text-sm font-semibold text-ink mb-1.5">
          NVIDIA API key
        </label>
        <input
          id="ai-key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={status?.available ? 'Enter a new key to replace the current one' : 'nvapi-…'}
          className="input w-full font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
        />
        <p className="text-[11px] text-muted mt-1">
          Write-only. Saving replaces the stored key — there is no way to read it back, by design.
        </p>
      </div>

      <div>
        <label htmlFor="ai-model" className="block text-sm font-semibold text-ink mb-1.5">
          Model id <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="ai-model"
          type="text"
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder={status?.model || 'vendor/model-name'}
          className="input w-full font-mono text-sm"
          spellCheck={false}
          disabled={saving}
        />
        <p className="text-[11px] text-muted mt-1">
          Leave blank to keep the current model. Every parameter you send must be one your model
          supports — an unsupported parameter is rejected outright rather than ignored.
        </p>
      </div>

      {msg && (
        <div
          role="status"
          className={`rounded-lg border p-2.5 text-xs ${
            msg.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          {msg.text}
        </div>
      )}

      {verifyResult && (
        <div
          role="status"
          className={`rounded-lg border p-2.5 text-xs flex items-start gap-2 ${
            verifyResult.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            {verifyResult.detail}
            {verifyResult.status ? <span className="opacity-70"> (HTTP {verifyResult.status})</span> : null}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying || !status?.available}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-elevated text-ink border border-line/30 disabled:opacity-50"
        >
          {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Test connection
        </button>
        {status?.source === 'admin-panel' && (
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-danger border border-danger/30 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove panel key
          </button>
        )}
      </div>
    </form>
  );
}
