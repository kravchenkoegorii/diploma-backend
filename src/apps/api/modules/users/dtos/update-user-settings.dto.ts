import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsBoolean()
  @ApiProperty({ required: false, default: true })
  shouldExecuteActionsWithoutConfirmation: boolean;
}
