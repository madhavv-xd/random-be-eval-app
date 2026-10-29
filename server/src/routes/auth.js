import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models.js';
import { auth, httpError, signToken, str } from '../lib.js';

const router = Router();
const USERNAME = /^[a-z0-9_.]{3,20}$/;
const EMAIL = /^\S+@\S+\.\S+$/;

router.post('/auth/register', async (req, res) => {
  const name = str(req.body.name);
  const username = str(req.body.username).toLowerCase();
  const email = str(req.body.email).toLowerCase();
  const password = String(req.body.password ?? '');

  if (!name) throw httpError(400, 'Name is required');
  if (!USERNAME.test(username)) throw httpError(400, 'Username must be 3-20 characters: letters, numbers, _ or .');
  if (!EMAIL.test(email)) throw httpError(400, 'Please enter a valid email');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const user = await User.create({ name, username, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user.id), user });
});

// "login" can be a username or an email.
router.post('/auth/login', async (req, res) => {
  const login = str(req.body.login).toLowerCase();
  const user = await User.findOne({ $or: [{ username: login }, { email: login }] }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(String(req.body.password ?? ''), user.passwordHash))) {
    throw httpError(401, 'Wrong username or password');
  }
  res.json({ token: signToken(user.id), user });
});

router.get('/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw httpError(401, 'Please log in');
  res.json({ user });
});

export default router;
