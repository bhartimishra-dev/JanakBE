import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'default_secret',
  // Intentionally no expiry — access tokens are meant to stay valid
  // indefinitely (an explicit product decision); only an explicit logout
  // (which blacklists that specific token in Redis) ends a session.
}));
