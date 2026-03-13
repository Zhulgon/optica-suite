import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../jwt-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtUser): Promise<JwtUser> {
    if (!payload?.sub || typeof payload.tokenVersion !== 'number') {
      throw new UnauthorizedException('Token invalido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        siteId: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException(
        'Sesion invalida. Inicia sesion nuevamente.',
      );
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      siteId: user.siteId ?? null,
      tokenVersion: user.tokenVersion,
    };
  }
}
