import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Address } from 'viem';
import { ApiProperty } from '@nestjs/swagger';

export class GetPoolRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  address: Address;

  @ApiProperty()
  @IsNumber()
  chainId: number;
}

export class GetPoolsBodyDto {
  @ApiProperty({ type: [GetPoolRequestDto] })
  @IsArray()
  addresses: GetPoolRequestDto[];
}
