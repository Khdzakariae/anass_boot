import jwt from "jsonwebtoken";
import { logger } from "../utils.js";

export function getUserIdFromToken(req) {
  try {
    let token = null;

    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token && req.cookies && req.cookies.auth) {
      token = req.cookies.auth;
    }

    if (!token) {
      return null;
    }

    const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-key";
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded && decoded.id) {
      return String(decoded.id);
    }

    return null;
  } catch (error) {
    logger.error("Token verification failed", { error: error.message });
    return null;
  }
}

export function authenticateToken(req, res, next) {
  const userId = getUserIdFromToken(req);

  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing token",
    });
  }

  req.userId = userId;
  next();
}

export default authenticateToken;


