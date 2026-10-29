import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api';
import { useToast } from './toast';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const NOTIFICATION_TEXT = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you',
  comment_like: 'liked your comment',
  follow: 'started following you',
  follow_request: 'requested to follow you',
  follow_accept: 'accepted your follow request',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token'));
  const [unread, setUnread] = useState(0); // notifications
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [socket, setSocket] = useState(null);
  const toast = useToast();

  // Restore the session from the stored JWT.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // While logged in: fetch the badge counts once, then keep them live over Socket.io.
  useEffect(() => {
    if (!user?._id) return;
    api('/counts').then((c) => { setUnread(c.notifications); setUnreadMessages(c.messages); }).catch(() => {});
    const s = io({ auth: { token: localStorage.getItem('token') } });
    s.on('notification:new', (n) => {
      setUnread((count) => count + 1);
      toast(`${n.actorId.username} ${NOTIFICATION_TEXT[n.type]}`);
    });
    s.on('message:new', (m) => {
      // Ignore my own messages, and chats I'm looking at right now (that page marks them read).
      if (m.senderId === user._id || window.location.pathname === `/messages/${m.conversationId}`) return;
      setUnreadMessages((count) => count + 1);
      toast(`${m.sender.username}: ${m.body.slice(0, 60)}`);
    });
    setSocket(s);
    return () => s.disconnect();
  }, [user?._id, toast]);

  function startSession({ token, user }) {
    localStorage.setItem('token', token);
    setUser(user);
  }

  const value = {
    user, setUser, loading, socket,
    unread, setUnread, unreadMessages, setUnreadMessages,
    login: (body) => api('/auth/login', { method: 'POST', body }).then(startSession),
    register: (body) => api('/auth/register', { method: 'POST', body }).then(startSession),
    logout: () => {
      localStorage.removeItem('token');
      setUser(null);
      setUnread(0);
      setUnreadMessages(0);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
