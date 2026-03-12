import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';

type DailyRow = {
  date: string;
  salesCount: number;
  total: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateRange(query: SalesReportQueryDto) {
    const end = query.to ? new Date(query.to) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = query.from
      ? new Date(query.from)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    return { start, end };
  }

  async getSalesSummary(query: SalesReportQueryDto) {
    const { start, end } = this.getDateRange(query);

    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        patient: {
          select: {
            id: true,
          },
        },
        items: {
          include: {
            frame: {
              select: {
                id: true,
                codigo: true,
                referencia: true,
              },
            },
          },
        },
        lensItems: {
          select: {
            quantity: true,
            subtotalSale: true,
            subtotalCost: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const salesCount = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalGrossProfit = sales.reduce((sum, sale) => sum + sale.grossProfit, 0);
    const totalItems = sales.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0) +
        sale.lensItems.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const totalLensRevenue = sales.reduce(
      (sum, sale) =>
        sum + sale.lensItems.reduce((itemSum, item) => itemSum + item.subtotalSale, 0),
      0,
    );
    const totalLensCost = sales.reduce(
      (sum, sale) =>
        sum + sale.lensItems.reduce((itemSum, item) => itemSum + item.subtotalCost, 0),
      0,
    );
    const uniquePatients = new Set(
      sales.filter((sale) => sale.patient?.id).map((sale) => sale.patient!.id),
    ).size;

    const byPayment = new Map<string, { salesCount: number; total: number }>();
    const byUser = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        role: string;
        salesCount: number;
        total: number;
        grossProfit: number;
        totalItems: number;
        lensRevenue: number;
        lensCost: number;
      }
    >();
    const byRole = new Map<string, { salesCount: number; total: number }>();
    const byFrame = new Map<
      string,
      { frameId: string; codigo: number; referencia: string; quantity: number; revenue: number }
    >();
    const byDay = new Map<string, DailyRow>();

    for (const sale of sales) {
      const paymentKey = sale.paymentMethod;
      const paymentCurrent = byPayment.get(paymentKey) ?? {
        salesCount: 0,
        total: 0,
      };
      paymentCurrent.salesCount += 1;
      paymentCurrent.total += sale.total;
      byPayment.set(paymentKey, paymentCurrent);

      const dayKey = sale.createdAt.toISOString().slice(0, 10);
      const dayCurrent = byDay.get(dayKey) ?? {
        date: dayKey,
        salesCount: 0,
        total: 0,
      };
      dayCurrent.salesCount += 1;
      dayCurrent.total += sale.total;
      byDay.set(dayKey, dayCurrent);

      const roleKey = sale.createdBy?.role ?? 'SIN_ROL';
      const roleCurrent = byRole.get(roleKey) ?? { salesCount: 0, total: 0 };
      roleCurrent.salesCount += 1;
      roleCurrent.total += sale.total;
      byRole.set(roleKey, roleCurrent);

      if (sale.createdBy) {
        const soldItemsCount =
          sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0) +
          sale.lensItems.reduce((itemSum, item) => itemSum + item.quantity, 0);
        const userKey = sale.createdBy.id;
        const userCurrent = byUser.get(userKey) ?? {
          userId: sale.createdBy.id,
          name: sale.createdBy.name,
          email: sale.createdBy.email,
          role: sale.createdBy.role,
          salesCount: 0,
          total: 0,
          grossProfit: 0,
          totalItems: 0,
          lensRevenue: 0,
          lensCost: 0,
        };
        userCurrent.salesCount += 1;
        userCurrent.total += sale.total;
        userCurrent.grossProfit += sale.grossProfit;
        userCurrent.totalItems += soldItemsCount;
        userCurrent.lensRevenue += sale.lensSubtotal;
        userCurrent.lensCost += sale.lensCostTotal;
        byUser.set(userKey, userCurrent);
      }

      for (const item of sale.items) {
        const frame = item.frame;
        const frameCurrent = byFrame.get(frame.id) ?? {
          frameId: frame.id,
          codigo: frame.codigo,
          referencia: frame.referencia,
          quantity: 0,
          revenue: 0,
        };
        frameCurrent.quantity += item.quantity;
        frameCurrent.revenue += item.subtotal;
        byFrame.set(frame.id, frameCurrent);
      }
    }

    return {
      range: {
        from: start.toISOString(),
        to: end.toISOString(),
      },
      totals: {
        salesCount,
        totalRevenue,
        averageTicket: salesCount ? totalRevenue / salesCount : 0,
        totalItems,
        uniquePatients,
        totalLensRevenue,
        totalLensCost,
        estimatedGrossProfit: totalGrossProfit,
      },
      byPaymentMethod: Array.from(byPayment.entries())
        .map(([paymentMethod, values]) => ({
          paymentMethod,
          ...values,
        }))
        .sort((a, b) => b.total - a.total),
      byUser: Array.from(byUser.values())
        .map((row) => ({
          ...row,
          averageTicket: row.salesCount ? row.total / row.salesCount : 0,
          marginPercent: row.total ? (row.grossProfit / row.total) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total),
      byRole: Array.from(byRole.entries())
        .map(([role, values]) => ({
          role,
          ...values,
        }))
        .sort((a, b) => b.total - a.total),
      topFrames: Array.from(byFrame.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      dailySeries: Array.from(byDay.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }
}
