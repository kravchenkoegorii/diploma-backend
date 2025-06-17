import { Injectable } from '@nestjs/common';
import { PrivyAuthService } from './services/privy-auth.service';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../users/repositories/users.repository';
import { UserDto } from '../users/dtos/user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly privyAuthService: PrivyAuthService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async registerUser(authToken?: string): Promise<UserDto> {
    if (!authToken) {
      throw new Error('Auth token is required');
    }

    const userData = await this.privyAuthService.validateAuthToken(authToken);

    const existingUser = await this.usersRepository.findOne({
      where: { privy_id: userData.privyId },
    });

    const user = await this.usersService.createOrUpdateUser({
      id: existingUser?.id,
      ...userData,
    });

    return new UserDto(user);
  }
}
