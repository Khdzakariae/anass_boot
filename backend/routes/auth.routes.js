import { Router } from 'express';
import { signUp, signIn, signOut } from '../services/AuthService.js';

const authRouter = Router();

authRouter.post('/sign-up', signUp);
authRouter.post('/sign-in', signIn);
authRouter.post('/logout', signOut);

export default authRouter;
