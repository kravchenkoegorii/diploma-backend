import { ChatCompletionTool } from 'openai/resources';

export interface IFunctionTool extends ChatCompletionTool {
  execute?: (...args: unknown[]) => unknown;
  toString?: (response: unknown | unknown[], isExternalChat: boolean) => string;
}

export type TTool = (
  execute?: IFunctionTool['execute'],
  toString?: IFunctionTool['toString'],
  ...args: unknown[]
) => IFunctionTool;
