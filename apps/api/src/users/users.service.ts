import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateUserAdminDto } from './dto/create-user-admin.dto'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createByAdmin(dto: CreateUserAdminDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (existing) {
      throw new BadRequestException('Email ya registrado')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })
  }
}