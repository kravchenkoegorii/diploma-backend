import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateChatDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  chatId: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'New title of the chat' })
  title: string;
}
