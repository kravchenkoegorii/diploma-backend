import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetChatWithMessagesDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  chatId: string;
}
