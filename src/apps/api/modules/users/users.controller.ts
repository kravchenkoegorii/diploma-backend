import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUserByPrivyAuth } from '../auth/decorator/get-user-by-privy-auth.decorator';
import {
  GetWalletAddress,
  UseBearerTokenAuthGuard,
} from '../auth/guards/auth.guard';
import { UpdateUserSettingsDto } from './dtos/update-user-settings.dto';
import { UserDto } from './dtos/user.dto';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';
import { UserSettingsDto } from './dtos/user-settings.dto';

@Controller('users')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiBearerAuth('access-token')
  @UseBearerTokenAuthGuard()
  @ApiResponse({ type: UserDto })
  @ApiOperation({
    summary: 'Get user',
  })
  @Get()
  async getUser(@GetWalletAddress() defaultWallet: string) {
    const user = await this.usersService.getUserByAddress(defaultWallet);

    if (!user) {
      throw new NotFoundException(
        `A User with the "${defaultWallet}" wallet address hash doesn't exist.`,
      );
    }

    return new UserDto(user);
  }

  @ApiBearerAuth('access-token')
  @UseBearerTokenAuthGuard()
  @ApiResponse({ type: UserSettingsDto })
  @ApiOperation({
    summary: 'Update user settings',
  })
  @ApiBody({ type: UpdateUserSettingsDto })
  @Patch()
  async updateUserSettings(
    @GetUserByPrivyAuth() user: UserEntity,
    @Body() updateSettingsDto: UpdateUserSettingsDto,
  ) {
    const data = await this.usersService.updateUserSettings(
      user,
      updateSettingsDto,
    );
    return data;
  }
}
