import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ListInventoryMovementsQueryDto } from './dto/list-inventory-movements.query.dto'

@Injectable()
export class InventoryMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListInventoryMovementsQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    const skip = (page - 1) * limit

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('El parámetro "from" no puede ser mayor que "to"')
    }

    const fromDate = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined
    const toDate = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined

    const where: any = {
      ...(query.frameId ? { frameId: query.frameId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    }

    const [total, data] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { frame: true },
      }),
    ])

    return {
      success: true,
      page,
      limit,
      total,
      count: data.length,
      data,
    }
  }
}