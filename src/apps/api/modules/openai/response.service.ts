import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Role } from 'src/common/enums/openai.role.enum';
import { ChatModel } from 'openai/resources';
import { getTopTokensSchema } from './format-message-schemes/get-top-tokens';
import { TokenResponse } from 'src/common/types';
import { Address } from 'viem';

@Injectable()
export class ResponseService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(ResponseService.name);

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      organization: process.env.OPENAI_ORGANIZATION_ID || '',
    });
  }

  async addTopTokensShortInfo({
    model,
    data,
    previous_response_id,
  }: {
    model: ChatModel;
    previous_response_id?: string;
    data: TokenResponse[];
  }) {
    try {
      const response = await this.openai.responses.create({
        model: model,
        previous_response_id: previous_response_id,
        input: [
          {
            role: Role.ASSISTANT,
            content: JSON.stringify({
              tokens: data,
            }),
          },
        ],
        text: getTopTokensSchema,
      });
      const opinionsFromAi = JSON.parse(response.output_text)?.tokens as {
        tokenAddress: Address;
        shortOpinionAboutToken: string;
      }[];

      if (opinionsFromAi?.length) {
        const map = new Map<string, string>();
        opinionsFromAi.forEach(({ tokenAddress, shortOpinionAboutToken }) => {
          map.set(tokenAddress.toLowerCase(), shortOpinionAboutToken);
        });

        return data.map((token) => {
          const shortInfo = map.get(token.token_address.toLowerCase());
          return {
            ...token,
            shortDescrFromAi: shortInfo ?? '',
          };
        });
      } else {
        data;
      }
    } catch (error) {
      this.logger.error('Error while getting opinions for tokens', error);
      return data;
    }
  }
}
