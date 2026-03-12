import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloseCashClosureDto } from './dto/close-cash-closure.dto';
import { ListCashClosuresQueryDto } from './dto/list-cash-closures.query.dto';

@Injectable()
export class CashClosuresService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeClosureUsers = {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
    closedBy: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
  } as const;

  private parseDateRange(fromDate?: string, toDate?: string) {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setHours(0, 0, 0, 0);

    const start = fromDate ? new Date(fromDate) : defaultStart;
    const end = toDate ? new Date(toDate) : now;

    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('fromDate invalida');
    }
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('toDate invalida');
    }

    // Date-only inputs arrive at 00:00. Move `to` to end-of-day in that case.
    if (toDate && toDate.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }

    if (start > end) {
      throw new BadRequestException('fromDate no puede ser mayor que toDate');
    }

    return { start, end };
  }

  private async resolveTargetUserId(
    actorUserId: string,
    actorRole: Role,
    requestedUserId?: string,
  ) {
    if (requestedUserId && actorRole !== 'ADMIN' && requestedUserId !== actorUserId) {
      throw new ForbiddenException('Solo ADMIN puede cerrar caja de otro usuario');
    }

    const targetUserId =
      actorRole === 'ADMIN' && requestedUserId ? requestedUserId : actorUserId;

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });
    if (!targetUser) {
      throw new NotFoundException('Usuario objetivo no encontrado');
    }

    return targetUser.id;
  }

  async close(
    dto: CloseCashClosureDto,
    actorUserId: string,
    actorRole: Role,
  ) {
    const targetUserId = await this.resolveTargetUserId(
      actorUserId,
      actorRole,
      dto.userId,
    );

    const { start, end } = this.parseDateRange(dto.fromDate, dto.toDate);

    const duplicate = await this.prisma.cashClosure.findFirst({
      where: {
        userId: targetUserId,
        periodStart: start,
        periodEnd: end,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Ya existe un cierre de caja para ese usuario y rango',
      );
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        createdById: targetUserId,
        status: 'ACTIVE',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
      },
    });

    const totals = sales.reduce(
      (acc, sale) => {
        acc.totalSales += sale.total;
        if (sale.paymentMethod === 'CASH') acc.cashSales += sale.total;
        if (sale.paymentMethod === 'CARD') acc.cardSales += sale.total;
        if (sale.paymentMethod === 'TRANSFER') acc.transferSales += sale.total;
        if (sale.paymentMethod === 'MIXED') acc.mixedSales += sale.total;
        return acc;
      },
      {
        totalSales: 0,
        cashSales: 0,
        cardSales: 0,
        transferSales: 0,
        mixedSales: 0,
      },
    );

    const expectedCash = totals.cashSales;
    const difference = dto.declaredCash - expectedCash;

    return this.prisma.cashClosure.create({
      data: {
        userId: targetUserId,
        closedById: actorUserId,
        periodStart: start,
        periodEnd: end,
        salesCount: sales.length,
        totalSales: totals.totalSales,
        cashSales: totals.cashSales,
        cardSales: totals.cardSales,
        transferSales: totals.transferSales,
        mixedSales: totals.mixedSales,
        expectedCash,
        declaredCash: dto.declaredCash,
        difference,
        notes: dto.notes?.trim() || null,
      },
      include: this.includeClosureUsers,
    });
  }

  async findAll(query: ListCashClosuresQueryDto, actorUserId: string, actorRole: Role) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const skip = (page - 1) * limit;

    if (query.fromDate && query.toDate && new Date(query.fromDate) > new Date(query.toDate)) {
      throw new BadRequestException('fromDate no puede ser mayor que toDate');
    }

    const where: Prisma.CashClosureWhereInput = {
      ...(actorRole === 'ADMIN'
        ? query.userId
          ? { userId: query.userId }
          : {}
        : { userId: actorUserId }),
      ...(query.fromDate || query.toDate
        ? {
            periodStart: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            },
            periodEnd: {
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.cashClosure.count({ where }),
      this.prisma.cashClosure.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.includeClosureUsers,
      }),
    ]);

    return {
      success: true,
      page,
      limit,
      total,
      count: data.length,
      data,
    };
  }
}
