import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { YamlConfig } from '../types/yaml-config.type';

export const isProduction = process.env.IS_PRODUCTION === 'true';
const YAML_CONFIG_FILENAME = isProduction
  ? 'config.prod.yaml'
  : 'config.dev.yaml';

export const yamlConfig = yaml.load(
  readFileSync(join(__dirname, YAML_CONFIG_FILENAME), 'utf8'),
) as YamlConfig;
