import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { ETxMessageType } from '../types';
import { Hash } from 'viem';

export class TxMessageDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  hash: Hash;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty()
  chainId: number;
}

export class CreateTxMessageDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  @ApiProperty()
  chatId: string;

  @IsNotEmpty({ each: true })
  @ApiProperty({ isArray: true, type: TxMessageDto })
  transactions: TxMessageDto[];

  @IsNotEmpty()
  @IsEnum(ETxMessageType)
  @ApiProperty({ enum: ETxMessageType })
  type: ETxMessageType;
}
