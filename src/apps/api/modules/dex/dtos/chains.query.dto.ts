import { ArrayNotEmpty, IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class ChainsQueryDto {
  @ApiProperty({
    description: 'Chains IDs',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)],
  )
  chains: number[];
}
