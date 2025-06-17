import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import {
  UseBearerTokenAuthGuard,
  UseOptionalAuthGuard,
} from '../auth/guards/auth.guard';
import { SenderType } from '../../../../common/enums/sender.type.enum';
import { MessagesService } from './messages.service';
import { GetUserByPrivyAuth } from '../auth/decorator/get-user-by-privy-auth.decorator';
import { UserEntity } from '../users/entities/user.entity';
import { isObject } from 'class-validator';
import { CreateTxMessageDto } from './dto/create-swap-tx-message.dto';
import { CreateErrorMessageDto } from './dto/create-error-message.dto';
import { CacheService } from '../cache/cache.service';
import {
  hours,
  SkipThrottle,
  Throttle,
  ThrottlerException,
} from '@nestjs/throttler';
import { AuthThrottlerGuard } from 'src/common/guards/throtler.guard';
import { Request, Response } from 'express';
import { yamlConfig } from '../../../../common/configs/yaml.config';
import { HOUR } from 'src/common/constants/time';

@ApiTags('messages')
@Controller('messages')
@UseBearerTokenAuthGuard()
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cachingService: CacheService,
  ) {}

  @Get('limits')
  @ApiOperation({
    summary: 'Get limits of messages/hour for the user',
  })
  @SkipThrottle()
  @UseOptionalAuthGuard()
  async getLimits(@GetUserByPrivyAuth() user: UserEntity, @Req() req: Request) {
    const id = user?.id || req.ip;
    const hits = await this.cachingService.get<number | undefined>(
      `{${id}:default:default}:hits`,
    );
    const isBlocked =
      (await this.cachingService.get<number | undefined>(
        `{${id}:default:default}:blocked`,
      )) === 1;

    const usedLimitPerHour = Math.min(
      hits || 0,
      yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT,
    );

    const ttl = await this.cachingService.ttl(
      `{${id}:default:default}:blocked`,
    );
    const limitExpiresAt = new Date(Date.now() + ttl * 1000);

    return {
      isBlocked:
        isBlocked ||
        usedLimitPerHour >= yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT,
      usedLimitPerHour,
      totalLimitPerHHour: yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT,
      limitResetInMs: ttl,
      limitExpiresAt,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Add new messages (user and AI response) to the chat',
  })
  @UseGuards(AuthThrottlerGuard)
  @Throttle({
    default: { limit: yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT, ttl: hours(1) },
  })
  async addMessage(
    @Body() dto: CreateChatMessageDto,
    @GetUserByPrivyAuth() user: UserEntity,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const id = user?.id || req.ip;
    const hits = await this.cachingService.get<number | undefined>(
      `{${id}:default:default}:hits`,
    );
    const usedLimitPerHour = Math.min(
      hits || 0,
      yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT,
    );
    if (usedLimitPerHour >= yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT) {
      await this.cachingService.set(`{${id}:default:default}:blocked`, 1, HOUR);
    }

    const result = await this.messagesService.addChatMessage(
      dto,
      SenderType.USER,
      user,
    );

    if (!isObject(result) || (isObject(result) && !('actionType' in result))) {
      const content = JSON.stringify(result)
        ?.slice(1, -1)
        ?.replace(/~/g, '&#126;');
      await this.messagesService.addChatMessage(
        {
          chatId: dto.chatId,
          content: content,
        },
        SenderType.AI,
        user,
        true,
      );
    }

    return res.send(result);
  }

  @Post('/add-tx')
  @ApiOperation({
    summary: 'Add new transaction messages (user and AI response) to the chat',
  })
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle()
  async addTxMessage(
    @Body() dto: CreateTxMessageDto,
    @GetUserByPrivyAuth() user: UserEntity,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const id = user?.id || req.ip;
    const throttleKey = `{${id}:default:default}:hits`;
    const hits = await this.cachingService.get<number | undefined>(throttleKey);
    const usedLimitPerHour = hits || 0;
    await this.cachingService.set(throttleKey, usedLimitPerHour + 1, HOUR);

    if (usedLimitPerHour + 1 >= yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT + 2) {
      throw new ThrottlerException();
    }

    const result = await this.messagesService.addTxMessage(dto, user);

    if (!isObject(result) || (isObject(result) && !('actionType' in result))) {
      const content = JSON.stringify(result)?.slice(1, -1);
      await this.messagesService.addChatMessage(
        {
          chatId: dto.chatId,
          content: content,
        },
        SenderType.AI,
        user,
        true,
      );
    }

    return res.send(result);
  }

  @Post('/error')
  @ApiOperation({
    summary: 'Add error (AI response) to the chat',
  })
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle()
  async addErrorMessage(
    @Body() dto: CreateErrorMessageDto,
    @GetUserByPrivyAuth() user: UserEntity,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const id = user?.id || req.ip;
    const throttleKey = `{${id}:default:default}:hits`;
    const hits = await this.cachingService.get<number | undefined>(throttleKey);
    const usedLimitPerHour = hits || 0;
    await this.cachingService.set(throttleKey, usedLimitPerHour + 1, HOUR);

    if (usedLimitPerHour + 1 >= yamlConfig.TOTAL_MESSAGES_REQUEST_LIMIT + 2) {
      throw new ThrottlerException();
    }

    const result = await this.messagesService.addErrorMessage(dto, user);

    if (!isObject(result) || (isObject(result) && !('actionType' in result))) {
      const content = JSON.stringify(result)?.slice(1, -1);
      await this.messagesService.addChatMessage(
        {
          chatId: dto.chatId,
          content: content,
        },
        SenderType.AI,
        user,
        true,
      );
    }

    return res.send(
      typeof result === 'string' ? result.replace(/```/g, '') : result,
    );
  }
}
