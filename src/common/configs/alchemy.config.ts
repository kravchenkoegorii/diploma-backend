import { registerAs } from '@nestjs/config';
import { ConfigNames } from '../types/enums/config-names.enum';

export interface IAlchemyConfig {
  apiKey: string;
}

export default registerAs(ConfigNames.ALCHEMY, () => {
  const props = ['ALCHEMY_API_KEY'];

  for (const prop of props) {
    if (!process.env[prop]) {
      throw new Error(`[AlchemyConfig]: variable ${prop} is not configured`);
    }
  }
  const apiKey = process.env.ALCHEMY_API_KEY || '';

  const config: IAlchemyConfig = {
    apiKey,
  };
  return config;
});
