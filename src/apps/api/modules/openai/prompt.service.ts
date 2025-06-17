import { Injectable } from '@nestjs/common';
import { SYSTEM_PROMPT_BASE } from '../../../../common/prompts/openai.prompts';
import { KnowledgeRepository } from './repositories/knowledge.repositry';

@Injectable()
export class PromptService {
  constructor(private readonly knowledgeRepo: KnowledgeRepository) {
    this.getBasePrompt = this.getBasePrompt.bind(this);
    this.getKnowledgeKeys = this.getKnowledgeKeys.bind(this);
    this.getKnowledge = this.getKnowledge.bind(this);
  }

  getBasePrompt(): string {
    return SYSTEM_PROMPT_BASE;
  }

  async getKnowledgeKeys() {
    const knowledgeKeys = await this.knowledgeRepo.find();
    return knowledgeKeys.map((key) => key.key);
  }

  async getKnowledge(key: string) {
    const knowledge = await this.knowledgeRepo.findOne({
      where: { key },
    });
    return knowledge;
  }
}
