import { ApiProperty } from '@nestjs/swagger';

import { UserEntity } from '../entities/user.entity';
import { WalletEntity } from '../entities/wallet.entity';
import { UserSettingsDto } from './user-settings.dto';

export class UserDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  wallets?: WalletEntity[];

  @ApiProperty({ required: false })
  settings: UserSettingsDto;

  constructor(user: UserEntity) {
    this.id = user.id;
    this.email = user.email;
    this.phone = user.phone;
    this.wallets = user.wallets;
    this.settings = new UserSettingsDto(
      user.should_execute_actions_without_confirmation,
    );
  }
}
