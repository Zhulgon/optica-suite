import { BadRequestException } from '@nestjs/common';

export function validatePasswordPolicy(password: string) {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('minimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('al menos una mayuscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('al menos una minuscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('al menos un numero');
  }

  if (errors.length > 0) {
    throw new BadRequestException(`Password insegura: ${errors.join(', ')}`);
  }
}
