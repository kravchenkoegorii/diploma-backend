import { registerAs } from '@nestjs/config';

export interface IPrivyAuthConfig {
  appId: string;
  appSecret: string;
}

export const privyAuthConfig = registerAs('privy_auth', () => {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Invalid PrivyAuth config');
  }
  const config: IPrivyAuthConfig = {
    appId,
    appSecret,
  };

  return config;
});
