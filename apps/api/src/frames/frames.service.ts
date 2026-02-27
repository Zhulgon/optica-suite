import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ListFramesQueryDto } from './dto/list-frames.query.dto'

@Injectable()
export class FramesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListFramesQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    const skip = (page - 1) * limit

    const q = query.q?.trim()
    const conPlaqueta =
      query.conPlaqueta === undefined ? undefined : query.conPlaqueta === 'true'
    const inStock = query.inStock === 'true'

    const where: any = {
      ...(query.segmento ? { segmento: query.segmento } : {}),
      ...(conPlaqueta !== undefined ? { conPlaqueta } : {}),
      ...(inStock ? { stockActual: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [
              { referencia: { contains: q, mode: 'insensitive' as const } },
              ...(Number.isFinite(Number(q)) ? [{ codigo: Number(q) }] : []),
            ],
          }
        : {}),
    }

    const [total, data] = await Promise.all([
      this.prisma.frame.count({ where }),
      this.prisma.frame.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    return { success: true, page, limit, total, count: data.length, data }
  }

  async findOne(id: string) {
    return this.prisma.frame.findUnique({ where: { id } })
  }
}