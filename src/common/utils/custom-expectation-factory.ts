import { BadRequestException, ValidationError } from '@nestjs/common';

export const customExpectaionFactory = (
  validationErrors: ValidationError[] = [],
) => {
  const errors: string[] = [];

  for (let i = 0; i < validationErrors.length; i++) {
    const validError = validationErrors[i];

    if (!validError.constraints) {
      continue;
    }

    const values = Object.values(validError.constraints);

    errors.push(...values);
  }

  if (errors.length) {
    return new BadRequestException(errors[0]);
  }

  return new BadRequestException('Validation error');
};
