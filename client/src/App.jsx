import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from './auth';
import Layout, { Logo } from './components/Layout';
import { Empty } from './components/Ui';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Create from './pages/Create';
import Reels from './pages/Reels';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import PostPage from './pages/PostPage';
import TagPage from './pages/TagPage';
import Messages from './pages/Messages';
import Settings from './pages/Settings';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid h-dvh place-items-center"><div className="animate-pulse"><Logo /></div></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="explore" element={<Explore />} />
        <Route path="create" element={<Create />} />
        <Route path="reels" element={<Reels />} />
        <Route path="u/:username" element={<Profile />} />
        <Route path="p/:id" element={<PostPage />} />
        <Route path="tags/:tag" element={<TagPage />} />
        <Route path="messages/:id?" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="register" element={<Navigate to="/" replace />} />
        <Route path="*" element={
          <Empty icon={Compass} title="Page not found" text="That link is broken or the page was removed.">
            <Link to="/" className="btn btn-primary">Back home</Link>
          </Empty>
        } />
      </Route>
    </Routes>
  );
}
