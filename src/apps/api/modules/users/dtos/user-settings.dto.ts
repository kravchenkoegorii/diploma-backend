import { ApiProperty } from '@nestjs/swagger';

export class UserSettingsDto {
  @ApiProperty({ required: false, default: true })
  shouldExecuteActionsWithoutConfirmation: boolean;

  constructor(shouldExecuteActionsWithoutConfirmation) {
    this.shouldExecuteActionsWithoutConfirmation =
      shouldExecuteActionsWithoutConfirmation;
  }
}
