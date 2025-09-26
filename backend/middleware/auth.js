import { logger } from '../utils.js';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
  let token;

  // Get token from Authorization header or cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token.' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret); // assuming you have config.jwt.secret

    if (!decoded?.userId) {
      return res.status(401).json({ error: 'Not authorized, token invalid.' });
    }

    // Check if user exists in DB
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(401).json({ error: 'Not authorized, user not found.' });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role, // optional, if you have roles
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', { message: error.message, stack: error.stack });
    res.status(401).json({ error: 'Not authorized, token failed.' });
  }
};

export default authenticate;


