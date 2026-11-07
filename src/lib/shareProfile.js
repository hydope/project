// One-tap profile sharing — WhatsApp first (see the win-back + sharing plan:
// private, one-to-one sharing is how rishtas actually spread).
// Privacy: share ONLY the profile link. Never the photo or the bio — the
// recipient sees only what the site's visibility rules already allow
// (members-only profiles need sign-in; private profiles are not visible
// to share). No new privacy setting, no permission gate.

export function profileUrl(profile) {
  return `${window.location.origin}/profiles/${profile.id}`;
}

export function shareText(profile) {
  const name = String(profile.displayName || profile.display_name || '').trim();
  const city = String(profile.city || '').trim();
  const bits = [name];
  if (profile.age) bits.push(String(profile.age));
  if (city) bits.push(city);
  const who = bits.filter(Boolean).join(', ');
  if (!who) return `I found this profile on Shia Rishta: ${profileUrl(profile)}`;
  return `I found this profile on Shia Rishta — ${who}: ${profileUrl(profile)}`;
}

export function whatsappShareUrl(profile) {
  return `https://wa.me/?text=${encodeURIComponent(shareText(profile))}`;
}

// Returns true when the link landed on the clipboard. Falls back to a
// hidden textarea + execCommand for browsers without the async API.
export async function copyProfileLink(profile) {
  const url = profileUrl(profile);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Clipboard API unavailable or denied — textarea fallback.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
