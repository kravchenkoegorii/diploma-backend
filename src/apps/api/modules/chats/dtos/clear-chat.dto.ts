import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ClearChatDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  @ApiProperty()
  chatId: string;
}
