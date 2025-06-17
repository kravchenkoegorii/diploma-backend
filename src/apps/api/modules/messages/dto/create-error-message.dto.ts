import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateErrorMessageDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  @ApiProperty()
  chatId: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  error: string;
}
