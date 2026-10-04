// ── API facade — the ONLY import pages/components should use ─────────────────
// Thin, typed, sync-fast. Backed by the repository layer today, HTTP tomorrow.
// SWR-ready: every getter returns a promise; use `api.getProfiles` as SWR fetcher.
import useSWR from 'swr';
import { auth } from './authService';
import { profilesRepo, messagesRepo, matchesRepo, ticketsRepo } from './repository';

async function unwrap(promise, message) {
  try {
    return await promise;
  } catch (e) {
    // Keep the deliberate per-call copy above, but preserve the server's
    // structured signal so a page can branch on status / payload instead of
    // collapsing every failure into one generic message.
    const err = new Error(message);
    if (e?.status !== undefined) err.status = e.status;
    if (e?.payload) err.payload = e.payload;
    err.cause = e;
    throw err;
  }
}

export const api = {
  // ── Auth ──
  login: (email, password) => unwrap(auth.login({ email, password }), 'Login failed. Please try again.'),
  register: (data) => unwrap(auth.register(data), 'Registration failed. Please try again.'),
  logout: async () => {
    auth.logout();
    return { ok: true };
  },
  getMe: () => Promise.resolve(auth.current()),

  // ── Profiles ──
  getProfiles: (filters = {}) => unwrap(profilesRepo.search(filters), 'Could not load profiles.'),
  getProfile: (id) => unwrap(profilesRepo.getById(id), 'Could not load this profile.'),
  updateProfile: (id, data) => unwrap(profilesRepo.save({ ...data, id }), 'Could not save this profile.'),
  uploadPhoto: (file) => unwrap(profilesRepo.uploadPhoto(file), 'Could not upload that photo.'),
  deletePhoto: () => unwrap(profilesRepo.deletePhoto(), 'Could not remove your photo.'),

  // ── Messages ──
  getConversations: () => unwrap(messagesRepo.conversations(), 'Could not load conversations.'),
  getMessages: (cid) => unwrap(messagesRepo.thread(cid), 'Could not load messages.'),
  sendMessage: (cid, text) => unwrap(messagesRepo.send(cid, text), 'Could not send your message.'),

  // ── Matches ──
  getSuggestions: () => unwrap(matchesRepo.suggestions(), 'Could not load suggestions.'),
  expressInterest: (pid) => unwrap(matchesRepo.expressInterest(pid), 'Could not send interest.'),
  withdrawInterest: (pid) => unwrap(matchesRepo.withdrawInterest(pid), 'Could not withdraw interest.'),
  getReceivedInterests: () => unwrap(matchesRepo.receivedInterests(), 'Could not load requests.'),
  startConversation: (pid) => unwrap(matchesRepo.startConversation(pid), 'Could not start the conversation.'),

  // ── Favourites (saved profiles) ──
  // Server-backed so a save survives a reload and a new device. Sign-in is
  // required; there is no anonymous fallback, because a local-only save would
  // silently look like it persisted and then vanish.
  getFavourites: () => unwrap(matchesRepo.favourites(), 'Could not load your favourites.'),
  addFavourite: (pid) => unwrap(matchesRepo.addFavourite(pid), 'Could not save this profile.'),
  removeFavourite: (pid) => unwrap(matchesRepo.removeFavourite(pid), 'Could not remove this favourite.'),

  // ── Verification (trust ladder) ──
  submitVerification: (payload) => unwrap(matchesRepo.submitVerification(payload), 'Could not submit for verification.'),
  myVerifications: () => unwrap(matchesRepo.myVerifications(), 'Could not load your submissions.'),
  createWaliLink: () => unwrap(matchesRepo.createWaliLink(), 'Could not create the wali link.'),

  // ── Support ──
  getTickets: () => unwrap(ticketsRepo.all(), 'Could not load tickets.'),
  createTicket: async (ticket) => {
    await unwrap(ticketsRepo.create(ticket), 'Could not create your ticket.');
    return { ok: true };
  },
};

// ── SWR hooks — drop-in caching/dedup for any page ──
export const keys = {
  profiles: (filters = {}) => ['profiles', filters],
  profile: (id) => ['profile', id],
  conversations: () => ['conversations'],
  messages: (cid) => ['messages', cid],
  suggestions: () => ['suggestions'],
  tickets: () => ['tickets'],
};

export const useProfiles = (filters) => useSWR(keys.profiles(filters), () => api.getProfiles(filters));
export const useProfile = (id) => useSWR(id ? keys.profile(id) : null, () => api.getProfile(id));
export const useConversations = () => useSWR(keys.conversations(), api.getConversations);
export const useMessages = (cid) => useSWR(cid ? keys.messages(cid) : null, () => api.getMessages(cid));
export const useSuggestions = () => useSWR(keys.suggestions(), api.getSuggestions);
export const useTickets = () => useSWR(keys.tickets(), api.getTickets);

export default api;
