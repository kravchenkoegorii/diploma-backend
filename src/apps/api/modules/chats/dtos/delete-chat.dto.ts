import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteChatDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  chatId: string;
}
