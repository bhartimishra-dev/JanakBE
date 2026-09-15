import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'default_secret',
  // Was never actually read anywhere despite JWT_EXPIRES_IN sitting in .env
  // looking configured — auth.module.ts's signOptions was `{}`, so every
  // access token was signed with no `exp` claim at all and never expired.
  expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
}));
