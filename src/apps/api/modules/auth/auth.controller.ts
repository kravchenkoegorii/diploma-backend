import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserDto } from '../users/dtos/user.dto';
import { AuthService } from './auth.service';
import { GetAuthorizationHeader } from './decorator/get-authorization-header.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiBearerAuth('access-token')
  @ApiResponse({ type: UserDto })
  async registerUser(@GetAuthorizationHeader() authToken: string | undefined) {
    return await this.authService.registerUser(authToken);
  }
}
