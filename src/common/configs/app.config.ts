import { registerAs } from '@nestjs/config';
import { ConfigNames } from '../types/enums/config-names.enum';

export interface IAppConfig {
  port: number;
  isMainnet: boolean;
}

export default registerAs(ConfigNames.APP, () => {
  const port = process.env.PORT ? +process.env.PORT : 5001;
  const isMainnet = process.env.IS_MAINNET === 'true';

  const config: IAppConfig = {
    port: port,
    isMainnet,
  };
  return config;
});
