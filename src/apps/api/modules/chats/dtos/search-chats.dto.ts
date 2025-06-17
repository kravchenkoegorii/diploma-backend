import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SearchChatsDto {
  @ApiProperty({ description: 'Keyword to search in the chat title' })
  @IsNotEmpty()
  @IsString()
  keyword: string;
}
