// ─── Community data — feed, communities and full-page post threads ──────────
// Remote mode (VITE_API_URL set): everything below is MariaDB through the
// PHP API — shared across devices and members. Local mode keeps the seeded
// feed + per-member browser storage so the product works offline/demo.
import { read, write } from './api/storage';
import { http, useRemote } from './api/transport';

const COMMUNITIES_KEY = 'community_communities';
const POSTS_KEY = 'community_posts';
const COMMENTS_KEY = 'community_comments';

export const DEFAULT_COMMUNITIES = [
  { id: 'all', name: 'All', icon: '🌍', members: 2400 },
  { id: 'hyderabad', name: 'Hyderabad', icon: '🇮🇳', members: 340 },
  { id: 'dubai', name: 'Dubai', icon: '🇦🇪', members: 280 },
  { id: 'dallas', name: 'Dallas', icon: '🇺🇸', members: 195 },
  { id: 'london', name: 'London', icon: '🇬🇧', members: 420 },
  { id: 'toronto', name: 'Toronto', icon: '🇨🇦', members: 310 },
  { id: 'reverts', name: 'Reverts', icon: '🧘', members: 180 },
  { id: 'parents', name: 'Parents', icon: '👨‍👩‍👧‍👦', members: 220 },
  { id: 'newlywed', name: 'Newlywed', icon: '💍', members: 150 },
];

export const DEFAULT_POSTS = [
  { id: 1, sub: 'hyderabad', title: 'Best halal restaurants in Hyderabad for a first meeting?', author: 'Anonymous', avatar: 'A', replies: 12, likes: 24, time: '2h ago', tags: ['meeting'], pinned: true, body: 'Meeting her family over lunch in a few weeks and I want somewhere quiet with a family section. Somewhere we can actually talk without shouting over music — and halal certified, not just "no pork".' },
  { id: 2, sub: 'dallas', title: 'How to balance career and marriage preparation?', author: 'Fatima Z.', avatar: 'F', replies: 18, likes: 31, time: '4h ago', tags: ['career'], body: 'Final year of residency and my family has started talking timelines. How did those of you with demanding jobs prepare seriously without dropping the ball at work?' },
  { id: 3, sub: 'london', title: 'Tips for writing an authentic bio that reflects values', author: 'Anonymous', avatar: 'A', replies: 23, likes: 45, time: '6h ago', tags: ['profile'], body: 'Every bio I write sounds like a CV. How do you say what actually matters — deen, temperament, family expectations — without it reading like a job advert?' },
  { id: 4, sub: 'reverts', title: 'New reverts support group — weekly virtual meetups', author: 'Support Team', avatar: 'S', replies: 15, likes: 38, time: '8h ago', tags: ['support'], pinned: true, body: 'A gentle space for brothers and sisters who embraced Islam recently. Weekly video circle, small groups, no recordings. Say salaam below if you would like the invite.' },
  { id: 5, sub: 'parents', title: 'How to involve wali without overstepping boundaries?', author: 'Anonymous', avatar: 'A', replies: 29, likes: 52, time: '1d ago', tags: ['wali'], body: 'My wali is involved and supportive, but is asking for updates after every conversation. How do I keep him informed and comfortable without turning a getting-to-know-you into a report?' },
  { id: 6, sub: 'toronto', title: 'Understanding different sects — respectful dialogue', author: 'Imam Hassan', avatar: 'I', replies: 34, likes: 67, time: '1d ago', tags: ['faith'], body: 'A reminder that differences in practice deserve curiosity, not scoring points. Share how your family handled a mixed-background match with adab and clarity.' },
  { id: 7, sub: 'newlywed', title: 'Halal investment strategies for married couples', author: 'Anonymous', avatar: 'A', replies: 27, likes: 41, time: '2d ago', tags: ['finance'], body: 'We are two years in and finally have savings to plan with. What halal options did you actually use — sukuk, gold, sharia-screened funds? Looking for real experience, not theory.' },
  { id: 8, sub: 'hyderabad', title: 'Eid gathering for single professionals — interested?', author: 'Community Mod', avatar: 'C', replies: 45, likes: 89, time: '3d ago', tags: ['event'], body: 'Chaperoned Eid brunch, families welcome, no matchmaking pressure. Purely a chance to meet good people in a halal setting. Interest check below.' },
  { id: 9, sub: 'dallas', title: 'Red flags in early conversations — what to watch for', author: 'Anonymous', avatar: 'A', replies: 31, likes: 56, time: '3d ago', tags: ['safety'], body: 'Beyond the obvious, what made you pause in early conversations? Sharing patterns helps everyone here stay safe and stop wasting months.' },
  { id: 10, sub: 'reverts', title: 'Brothers: what helped you most after reverting?', author: 'Yusuf K.', avatar: 'Y', replies: 42, likes: 73, time: '4d ago', tags: ['reverts'], body: 'Two years in, alhamdulillah. The first six months were the hardest — community, routine and a patient mentor made the difference. What worked for you?' },
  { id: 11, sub: 'dubai', title: 'Nikah preparation checklist — what documents do I need?', author: 'Anonymous', avatar: 'A', replies: 38, likes: 62, time: '5d ago', tags: ['nikah'], body: 'Getting married in Dubai and the paperwork list keeps changing. For those who did it recently: what did the court actually ask for, and how long did it take?' },
  { id: 12, sub: 'dubai', title: 'Professional networking events for Muslims in Dubai?', author: 'Omar D.', avatar: 'O', replies: 21, likes: 44, time: '1w ago', tags: ['networking'], body: 'Building a small circle of like-minded professionals — finance, healthcare, tech. Any regular events worth attending that stay within halal boundaries?' },
];

// Seeded reply threads. The feed shows each post's lifetime reply count; these
// are the most recent few, which is why the post page labels a partial thread
// instead of pretending the thread is complete.
const SEED_REPLIES = {
  1: [
    { id: 'r1-1', author: 'Hassan N.', time: '1h ago', body: 'Paradise on MG Road has a quiet family section upstairs with its own entrance. Ask for the corner seating.' },
    { id: 'r1-2', author: 'Zainab A.', time: '50m ago', body: 'Bawarchi is excellent but painfully loud. If you want to actually talk, book a hotel cafe and ask for a table near the window.' },
    { id: 'r1-3', author: 'Anonymous', time: '20m ago', body: 'Whatever you choose, call ahead and confirm halal certification for that specific branch — it varies even within one chain.' },
  ],
  2: [
    { id: 'r2-1', author: 'Dr. Imran S.', time: '3h ago', body: 'Block two hours a week for the search itself, and say upfront: "I am on rotations, here is when I reply."' },
    { id: 'r2-2', author: 'Maryam S.', time: '2h ago', body: 'People worth your time will respect a demanding schedule. Anyone who needs constant replies is showing you something.' },
    { id: 'r2-3', author: 'Anonymous', time: '1h ago', body: 'Involve a parent or wali early — they can hold the timeline while you hold the job.' },
  ],
  3: [
    { id: 'r3-1', author: 'Aisha K.', time: '5h ago', body: 'Answer three things: what your day looks like, what you want your home to feel like, and what you are working on in yourself.' },
    { id: 'r3-2', author: 'Anonymous', time: '4h ago', body: 'Drop the adjectives. "Loves hiking and travel" says nothing; "takes the family camping every summer" says a lot.' },
    { id: 'r3-3', author: 'Bilal R.', time: '2h ago', body: 'Have someone honest read it before you publish. Mine was twice as long until my sister cut it.' },
  ],
  4: [
    { id: 'r4-1', author: 'Nura H.', time: '7h ago', body: 'Salaam — please add me. Four months in and the guidance helped more than I expected.' },
    { id: 'r4-2', author: 'Support Team', time: '6h ago', body: 'Added. The circle is Wednesdays after Maghrib, and stay for only as long as you need.' },
    { id: 'r4-3', author: 'Anonymous', time: '3h ago', body: 'Do you run separate circles for brothers and sisters, or one mixed with a moderator?' },
  ],
  5: [
    { id: 'r5-1', author: 'Umm Yusuf', time: '20h ago', body: 'Give him a short weekly summary instead of live updates. Same transparency, far less pressure on both sides.' },
    { id: 'r5-2', author: 'Hassan N.', time: '18h ago', body: 'A wali who cares is a blessing. Say plainly: "I will tell you anything you ask, but early conversations stay light."' },
    { id: 'r5-3', author: 'Anonymous', time: '15h ago', body: 'Bring him in for the important steps — intent, timeline, meeting her family — and keep small talk between the two of you.' },
  ],
  6: [
    { id: 'r6-1', author: 'Fatima Z.', time: '22h ago', body: 'My parents asked questions before making assumptions, and that one habit changed the whole conversation.' },
    { id: 'r6-2', author: 'Imam Hassan', time: '20h ago', body: 'Well said. Ask about practice and expectations, not labels and history.' },
    { id: 'r6-3', author: 'Anonymous', time: '18h ago', body: 'We agreed early on not to discuss this with relatives who would turn it into a debate.' },
  ],
  7: [
    { id: 'r7-1', author: 'Omar D.', time: '2d ago', body: 'Sharia-screened index funds through a halal platform, plus a small gold allocation. Check the purification ratio yearly.' },
    { id: 'r7-2', author: 'Aisha K.', time: '1d ago', body: 'Keep an emergency fund before anything else. Most of our first-year arguments were about money that never needed spending.' },
    { id: 'r7-3', author: 'Anonymous', time: '1d ago', body: 'Talk to a scholar you trust about sukuk — some products are structured differently than they look.' },
  ],
  8: [
    { id: 'r8-1', author: 'Zainab A.', time: '2d ago', body: 'Interested, and my mother would like to come too if there is space.' },
    { id: 'r8-2', author: 'Community Mod', time: '2d ago', body: 'Families are encouraged. We will cap it at forty so conversations stay possible.' },
    { id: 'r8-3', author: 'Anonymous', time: '1d ago', body: 'Is there a childrens area? Asking for my brother, who has two little ones.' },
  ],
  9: [
    { id: 'r9-1', author: 'Maryam S.', time: '3d ago', body: 'Rushing to move off-app within a day. Every time it happened, the story afterwards changed.' },
    { id: 'r9-2', author: 'Anonymous', time: '2d ago', body: 'Vague answers about work and family, but detailed questions about my income.' },
    { id: 'r9-3', author: 'Hassan N.', time: '2d ago', body: 'Anyone annoyed that a wali is involved is telling you something.' },
  ],
  10: [
    { id: 'r10-1', author: 'Nura H.', time: '4d ago', body: 'A small masjid close to home and the same faces every week. Consistency did more than any book.' },
    { id: 'r10-2', author: 'Yusuf K.', time: '3d ago', body: 'Same. Learning one surah properly felt better than skimming ten.' },
    { id: 'r10-3', author: 'Anonymous', time: '3d ago', body: 'Having someone I could ask the "silly" questions without judgement — that was everything in the first year.' },
  ],
  11: [
    { id: 'r11-1', author: 'Omar D.', time: '4d ago', body: 'Both parties need their Emirates ID, the pre-marital screening certificate and two witnesses. Screening took three days.' },
    { id: 'r11-2', author: 'Anonymous', time: '3d ago', body: 'If one of you is a resident and the other is on a visit visa, plan the timeline before booking flights.' },
    { id: 'r11-3', author: 'Aisha K.', time: '3d ago', body: 'Bring printed copies of everything, plus one extra of each. The court wanted physical documents.' },
  ],
  12: [
    { id: 'r12-1', author: 'Bilal R.', time: '6d ago', body: 'There is a monthly founders circle in Business Bay that stays professional and respectful. Good mix of backgrounds.' },
    { id: 'r12-2', author: 'Anonymous', time: '5d ago', body: 'The healthcare meetups at the medical city campus are worth it if that is your field.' },
    { id: 'r12-3', author: 'Omar D.', time: '4d ago', body: 'I will post the next one here once the date is confirmed.' },
  ],
};

const clone = value => JSON.parse(JSON.stringify(value));

export async function listCommunities() {
  if (useRemote) {
    const rooms = await http.get('/api/community');
    const ids = new Set(rooms.map(r => r.id));
    // The 'all' pseudo-room is a client concept; the API returns real rooms.
    return [{ id: 'all', name: 'All', icon: '🌍', members: rooms.reduce((n, r) => n + (r.members || 0), 0) },
      ...rooms.filter(r => r.id !== 'all'),
      ...(!ids.has('general') ? [{ id: 'general', name: 'General', icon: '💬', members: 0 }] : []),
    ];
  }
  const created = read(COMMUNITIES_KEY, []);
  return [...DEFAULT_COMMUNITIES, ...created];
}

export async function getCommunity(id) {
  return (await listCommunities()).find(c => c.id === id) || null;
}

export async function createCommunity({ name }) {
  if (useRemote) return http.post('/api/community', { name });
  const id = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!id || await getCommunity(id)) return null;
  const community = { id, name: String(name).trim(), icon: '🌍', members: 1, created: true };
  write(COMMUNITIES_KEY, [...read(COMMUNITIES_KEY, []), community]);
  return community;
}

// Member posts first (newest first), then the seeded feed.
export async function listPosts(sub = 'all') {
  if (useRemote) {
    const rows = await http.get(`/api/community/${encodeURIComponent(sub)}/posts`);
    return rows.map(normalizePost);
  }
  return [...read(POSTS_KEY, []), ...clone(DEFAULT_POSTS)];
}

export async function getPost(id) {
  if (useRemote) {
    try {
      const row = await http.get(`/api/community/post/${encodeURIComponent(id)}`);
      return normalizePost(row, row.repliesList || []);
    } catch {
      return null;
    }
  }
  const wanted = String(id);
  return listPostsSync().find(p => String(p.id) === wanted) || null;
}

function listPostsSync() {
  return [...read(POSTS_KEY, []), ...clone(DEFAULT_POSTS)];
}

function normalizePost(row, repliesList) {
  return {
    id: String(row.id), sub: row.sub, title: row.title, body: row.body || '',
    author: row.author || 'Member', avatar: String(row.author || 'M').trim().charAt(0).toUpperCase() || 'M',
    replies: row.replies ?? (repliesList ? repliesList.length : 0),
    likes: row.likes ?? 0,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : (row.time || ''),
    tags: row.tags || [], pinned: row.pinned || false,
    _repliesList: repliesList,
  };
}

export async function createPost({ sub, title, body = '', author = 'Anonymous', avatar = 'A' }) {
  if (useRemote) {
    const target = sub && sub !== 'all' ? sub : 'general';
    // The 'general' bucket may not exist yet on a fresh DB — create it once.
    if (target === 'general') {
      try { await http.post('/api/community', { name: 'general' }); } catch { /* exists */ }
    }
    const { id } = await http.post(`/api/community/${encodeURIComponent(target)}/posts`, { title, body, author });
    return { id: String(id), sub: target, title: title.trim(), body: body.trim(), author, avatar };
  }
  const post = {
    id: `m-${Date.now()}`,
    sub: sub && sub !== 'all' ? sub : 'general',
    title: title.trim(),
    body: body.trim(),
    author,
    avatar,
    replies: 0,
    likes: 0,
    time: 'Just now',
    tags: [],
    mine: true,
  };
  write(POSTS_KEY, [post, ...read(POSTS_KEY, [])]);
  return post;
}

export async function listReplies(postId) {
  if (useRemote) {
    const post = await getPost(postId);
    return (post?._repliesList || []).map(r => ({
      id: String(r.id), author: r.author, body: r.body,
      time: r.time ? new Date(r.time).toLocaleString() : '',
    }));
  }
  const seed = SEED_REPLIES[String(postId)] || [];
  const mine = read(COMMENTS_KEY, {})[String(postId)] || [];
  return [...seed, ...mine];
}

export async function addReply(postId, { body, author = 'You' }) {
  if (useRemote) {
    const { id } = await http.post(`/api/community/post/${encodeURIComponent(postId)}/replies`, { body });
    return { id: String(id), author, body: body.trim(), time: 'Just now', mine: true };
  }
  const all = read(COMMENTS_KEY, {});
  const key = String(postId);
  const reply = { id: `mr-${Date.now()}`, author, body: body.trim(), time: 'Just now', mine: true };
  all[key] = [...(all[key] || []), reply];
  write(COMMENTS_KEY, all);
  return reply;
}

// ── Moderation (admin only) ────────────────────────────────────────────────
// DELETE /api/community/post/:id removes the post and its replies; the
// server requires an admin session (403 otherwise). Returns the deleted id.
export async function deletePost(id) {
  if (useRemote) return http.del(`/api/community/post/${encodeURIComponent(id)}`);
  write(POSTS_KEY, read(POSTS_KEY, []).filter(p => String(p.id) !== String(id)));
  return { ok: true, id };
}

export async function deleteReply(id) {
  if (useRemote) return http.del(`/api/community/reply/${encodeURIComponent(id)}`);
  const all = read(COMMENTS_KEY, {});
  for (const key of Object.keys(all)) {
    all[key] = all[key].filter(r => String(r.id) !== String(id));
  }
  write(COMMENTS_KEY, all);
  return { ok: true, id };
}

// Every surface links through this so the feed and the post page cannot drift.
export function postPath(post) {
  return `/community/${post.sub}/post/${post.id}`;
}

// Sections of a community that is not a real seeded room (member-created rooms,
// or the "general" bucket used when posting from the All feed).
export async function isKnownCommunity(id) {
  return !!(await getCommunity(id));
}

