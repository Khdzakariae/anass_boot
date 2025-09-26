import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const signUp = async (req, res) => {
  console.log("SignUp raw body:", req.body); 

  try {
    const { firstName, lastName, email, password, ausbildungen } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        verified: false,
        name: `${firstName} ${lastName}`,
        ausbildungen: ausbildungen
          ? {
              create: ausbildungen.map((a) => ({
                title: a.title,
                institution: a.institution,
                location: a.location || 'N/A',
                startDate: a.startDate || 'N/A',
                vacancies: a.vacancies || 'N/A',
                phones: a.phones || '',
                url: a.url,
                description: a.description || 'N/A',
                emails: a.emails || '',
                motivationLetterPath: a.motivationLetterPath || null,
              })),
            }
          : undefined,
      },
      include: { ausbildungen: true },
    });

    res.status(201).json({
      message: 'User registered successfully!',
      data: newUser,
    });
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: 'An error occurred during sign up.' });
  }
};

export const signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRATION || '7d' }
    );

    res
    .cookie('auth', token, {
      httpOnly: true,
      secure: false,       // important for localhost
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    })
    .status(200)
    .json({ 
      message: 'Sign in successful.', 
      token, 
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'An error occurred during sign in.' });
  }
};

export const signOut = async (req, res) => {
  res.clearCookie('auth');
  res.status(200).json({ message: 'Logged out successfully.' });
};
