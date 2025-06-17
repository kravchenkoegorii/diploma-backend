import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChatMessageDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  @ApiProperty()
  chatId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200, { message: 'Content must not exceed 200 characters.' })
  @ApiProperty()
  content: string;
}
