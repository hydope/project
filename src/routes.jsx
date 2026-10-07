import { createBrowserRouter, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { lazy, Suspense, useLayoutEffect } from 'react';
import { RequireAuth, RequireAdmin } from './layouts/Guards';
import Seo from './components/Seo';

// Route-based code splitting — each page loads only when visited,
// keeping the first paint tiny and the app fast on every device.
const Home = lazy(() => import('./pages/Home'));
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.BrowseProfiles })));
const Favourites = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Favourites })));
const Profile = lazy(() => import('./pages/Profile'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));
const Community = lazy(() => import('./pages/Community'));
const CommunityPost = lazy(() => import('./pages/CommunityPost'));
const Contact = lazy(() => import('./pages/Contact'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Messages = lazy(() => import('./pages/Messages'));
const Support = lazy(() => import('./pages/Support'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const VerifyToken = lazy(() => import('./pages/auth/VerifyToken'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const WaliView = lazy(() => import('./pages/WaliView'));
const ClaimDraft = lazy(() => import('./pages/ClaimDraft'));
const Drafts = lazy(() => import('./pages/Drafts'));
const Agents = lazy(() => import('./pages/Agents'));
// Phase-2 exemplar: onboarding rebuilt as a feature module (features/onboarding/).
// Delete pages/Onboard.jsx once this is verified in all flows.
const Onboard = lazy(() => import('./pages/Onboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Guardians = lazy(() => import('./pages/Guardians'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const SuccessStories = lazy(() => import('./pages/SuccessStories'));
const About = lazy(() => import('./pages/About'));
// Teaches members how to write a strong profile. Doubles as the honest answer to
// "the browse page looks empty" — a good example beats invented people.
const ProfileGuide = lazy(() => import('./pages/ProfileGuide'));
const Safety = lazy(() => import('./pages/Safety'));
// Admin subpages
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
const AdminQueue = lazy(() => import('./pages/admin/AdminQueue'));
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminVerifyAccounts = lazy(() => import('./pages/admin/AdminVerifyAccounts'));
const AdminContent = lazy(() => import('./pages/admin/AdminContent'));
const AdminVerifications = lazy(() => import('./pages/admin/AdminVerifications'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles'));
const AdminGuardians = lazy(() => import('./pages/admin/AdminGuardians'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminMatchmaker = lazy(() => import('./pages/admin/AdminMatchmaker'));
const Matchmaker = lazy(() => import('./pages/Matchmaker'));
const BiodataMaker = lazy(() => import('./pages/BiodataMaker'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageSkeleton() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center">
        <div className="skeleton rounded-xl" style={{ width: 64, height: 8, margin: '0 auto 0.9rem' }} />
        <div className="skeleton rounded-xl" style={{ width: 180, height: 10, margin: '0 auto' }} />
      </div>
    </div>
  );
}

import { Component } from 'react';

// Catches chunk-load failures (e.g. stale bundle after a deploy) and retries
// once before showing a recoverable error instead of a white-screen crash.
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, retrying: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    // If this looks like a stale-chunk failure and we haven't retried yet,
    // reload once — the new deployment's chunks will then load cleanly.
    const msg = String(error?.message || '');
    if (!this.state.retrying && /dynamically imported module|chunk|import\(\)/i.test(msg)) {
      this.setState({ retrying: true });
      window.location.reload();
    }
  }
  render() {
    if (this.state.failed && !this.state.retrying) {
      return (
        <main className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="text-xl font-bold mb-2">Something went wrong loading this page</h1>
          <p className="text-sm opacity-70 mb-6">Please try again — your data is safe.</p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function LazyRoute({ component: Component }) {
  return (
    <ChunkErrorBoundary>
      <Seo />
      <ScrollToTop />
      <Suspense fallback={<PageSkeleton />}>
        <Component />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

// Reset scroll to top on every navigation (PUSH/REPLACE), so a link never
// lands the user at the bottom of the new page. Back/forward (POP) keeps the
// browser's natural scroll restoration. Hash-only changes are left alone.
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [pathname, navType]);
  return null;
}

// Each page renders its own layout (MainLayout/LandingLayout), so public routes
// stay flat to avoid double-wrapping. Member + admin routes nest under guards.
const router = createBrowserRouter([
  { path: '/', element: <LazyRoute component={Home} /> },
  { path: '/profiles', element: <LazyRoute component={Profiles} /> },
  { path: '/favorites', element: <LazyRoute component={Favourites} /> },
  { path: '/profiles/:id', element: <LazyRoute component={Profile} /> },
  { path: '/blog', element: <LazyRoute component={Blog} /> },
  { path: '/blog/:slug', element: <LazyRoute component={BlogPost} /> },
  // SEO landing pages (hand-written, unique copy) — one route each so every
  // page has a crawlable URL, unique meta, and FAQ schema.
  { path: '/shia-matrimony-usa', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-brides', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-grooms', element: <LazyRoute component={LandingPage} /> },
  { path: '/syed-rishta', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimony-chicago', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimony-houston', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimony-new-york', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimony-london', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimonial', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-marriage', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-nikah', element: <LazyRoute component={LandingPage} /> },
  { path: '/nikah-checklist', element: <LazyRoute component={LandingPage} /> },
  { path: '/duas-for-marriage', element: <LazyRoute component={LandingPage} /> },
  { path: '/shia-matrimony-toronto', element: <LazyRoute component={LandingPage} /> },
    { path: '/community', element: <LazyRoute component={Community} /> },
    { path: '/matchmaker', element: <LazyRoute component={Matchmaker} /> },
    { path: '/biodata-maker', element: <LazyRoute component={BiodataMaker} /> },
  { path: '/community/:slug', element: <LazyRoute component={Community} /> },
  { path: '/community/:slug/post/:postId', element: <LazyRoute component={CommunityPost} /> },
  { path: '/contact', element: <LazyRoute component={Contact} /> },
  { path: '/agents', element: <LazyRoute component={Agents} /> },
  { path: '/privacy', element: <LazyRoute component={Privacy} /> },
  { path: '/terms', element: <LazyRoute component={Terms} /> },
  { path: '/success-stories', element: <LazyRoute component={SuccessStories} /> },
  { path: '/about', element: <LazyRoute component={About} /> },
  { path: '/profile-guide', element: <LazyRoute component={ProfileGuide} /> },
  { path: '/safety', element: <LazyRoute component={Safety} /> },
  { path: '/support', element: <LazyRoute component={Support} /> },
  { path: '/guardians', element: <LazyRoute component={Guardians} /> },
  { path: '/auth/login', element: <LazyRoute component={Login} /> },
  { path: '/auth/register', element: <LazyRoute component={Register} /> },
  { path: '/login', element: <Navigate to="/auth/login" replace /> },
  { path: '/signup', element: <Navigate to="/auth/register" replace /> },
  { path: '/signin', element: <Navigate to="/auth/login" replace /> },
  { path: '/auth/forgot', element: <LazyRoute component={ForgotPassword} /> },
  { path: '/auth/reset', element: <LazyRoute component={ResetPassword} /> },
  { path: '/verify-email', element: <LazyRoute component={VerifyEmail} /> },
  { path: '/verify/:token', element: <LazyRoute component={VerifyToken} /> },
  { path: '/wali/:token', element: <LazyRoute component={WaliView} /> },
  { path: '/claim/:token', element: <LazyRoute component={ClaimDraft} /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/dashboard', element: <LazyRoute component={Dashboard} /> },
      { path: '/messages', element: <LazyRoute component={Messages} /> },
      { path: '/onboard', element: <LazyRoute component={Onboard} /> },
      { path: '/profile', element: <LazyRoute component={Onboard} /> },
      { path: '/settings', element: <LazyRoute component={Settings} /> },
      { path: '/drafts', element: <LazyRoute component={Drafts} /> },
    ],
  },
  {
    path: '/admin',
    children: [
      { index: true, element: <LazyRoute component={AdminLogin} /> },
      { path: 'login', element: <LazyRoute component={AdminLogin} /> },
      {
        element: <RequireAdmin />,
        children: [
          { path: 'dashboard', element: <LazyRoute component={AdminDashboard} /> },
          // The queue is the admin landing surface: reports and pending
          // verifications ranked together instead of split across two tabs.
          { path: 'queue', element: <LazyRoute component={AdminQueue} /> },
          { path: 'verify-accounts', element: <LazyRoute component={AdminVerifyAccounts} /> },
          { path: 'members', element: <LazyRoute component={AdminMembers} /> },
          { path: 'audit', element: <LazyRoute component={AdminAudit} /> },
          { path: 'content', element: <LazyRoute component={AdminContent} /> },
          { path: 'support', element: <LazyRoute component={AdminSupport} /> },
          { path: 'verifications', element: <LazyRoute component={AdminVerifications} /> },
          { path: 'roles', element: <LazyRoute component={AdminRoles} /> },
          { path: 'guardians', element: <LazyRoute component={AdminGuardians} /> },
          { path: 'analytics', element: <LazyRoute component={AdminAnalytics} /> },
          { path: 'matchmaker', element: <LazyRoute component={AdminMatchmaker} /> },
        ],
      },
    ],
  },
  { path: '*', element: <LazyRoute component={NotFound} /> },
]);

export default router;
