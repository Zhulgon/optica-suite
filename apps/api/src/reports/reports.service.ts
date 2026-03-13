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
    const now = new Date();
    const roundMoney = (value: number) =>
      Math.round((value + Number.EPSILON) * 100) / 100;

    const [sales, labOrders] = await Promise.all([
      this.prisma.sale.findMany({
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
              firstName: true,
              lastName: true,
              documentNumber: true,
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
      }),
      this.prisma.labOrder.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          status: true,
          promisedDate: true,
          sentAt: true,
          receivedAt: true,
          deliveredAt: true,
        },
      }),
    ]);

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
    const labTotals = labOrders.reduce(
      (acc, order) => {
        acc.totalOrders += 1;
        if (order.status === 'PENDING') acc.pendingOrders += 1;
        if (order.status === 'SENT_TO_LAB') acc.sentToLabOrders += 1;
        if (order.status === 'RECEIVED') acc.receivedOrders += 1;
        if (order.status === 'DELIVERED') acc.deliveredOrders += 1;
        if (order.status === 'CANCELLED') acc.cancelledOrders += 1;

        if (
          order.promisedDate &&
          order.status !== 'DELIVERED' &&
          order.status !== 'CANCELLED'
        ) {
          const promisedEnd = new Date(order.promisedDate);
          promisedEnd.setHours(23, 59, 59, 999);
          if (promisedEnd.getTime() < now.getTime()) {
            acc.overdueOpenOrders += 1;
          }
        }

        if (order.sentAt && order.receivedAt) {
          const diffDays =
            (order.receivedAt.getTime() - order.sentAt.getTime()) /
            (24 * 60 * 60 * 1000);
          if (Number.isFinite(diffDays) && diffDays >= 0) {
            acc.receivedLeadTimeSumDays += diffDays;
            acc.receivedLeadTimeCount += 1;
          }
        }

        if (order.sentAt && order.deliveredAt) {
          const diffDays =
            (order.deliveredAt.getTime() - order.sentAt.getTime()) /
            (24 * 60 * 60 * 1000);
          if (Number.isFinite(diffDays) && diffDays >= 0) {
            acc.deliveredLeadTimeSumDays += diffDays;
            acc.deliveredLeadTimeCount += 1;
          }
        }

        if (order.status === 'DELIVERED' && order.promisedDate && order.deliveredAt) {
          const promisedEnd = new Date(order.promisedDate);
          promisedEnd.setHours(23, 59, 59, 999);
          if (order.deliveredAt.getTime() <= promisedEnd.getTime()) {
            acc.onTimeDeliveries += 1;
          } else {
            acc.lateDeliveries += 1;
          }
        }
        return acc;
      },
      {
        totalOrders: 0,
        pendingOrders: 0,
        sentToLabOrders: 0,
        receivedOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        overdueOpenOrders: 0,
        onTimeDeliveries: 0,
        lateDeliveries: 0,
        receivedLeadTimeSumDays: 0,
        receivedLeadTimeCount: 0,
        deliveredLeadTimeSumDays: 0,
        deliveredLeadTimeCount: 0,
      },
    );

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
    const byPatient = new Map<
      string,
      {
        patientId: string;
        firstName: string;
        lastName: string;
        documentNumber: string;
        salesCount: number;
        total: number;
        lastSaleAt: string;
      }
    >();

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

      if (sale.patient?.id) {
        const patientKey = sale.patient.id;
        const patientCurrent = byPatient.get(patientKey) ?? {
          patientId: sale.patient.id,
          firstName: sale.patient.firstName,
          lastName: sale.patient.lastName,
          documentNumber: sale.patient.documentNumber,
          salesCount: 0,
          total: 0,
          lastSaleAt: sale.createdAt.toISOString(),
        };
        patientCurrent.salesCount += 1;
        patientCurrent.total += sale.total;
        if (sale.createdAt.toISOString() > patientCurrent.lastSaleAt) {
          patientCurrent.lastSaleAt = sale.createdAt.toISOString();
        }
        byPatient.set(patientKey, patientCurrent);
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
      lab: {
        ...labTotals,
        onTimeDeliveryRate:
          labTotals.onTimeDeliveries + labTotals.lateDeliveries > 0
            ? roundMoney(
                (labTotals.onTimeDeliveries * 100) /
                  (labTotals.onTimeDeliveries + labTotals.lateDeliveries),
              )
            : 0,
        avgDaysSentToReceived:
          labTotals.receivedLeadTimeCount > 0
            ? roundMoney(
                labTotals.receivedLeadTimeSumDays / labTotals.receivedLeadTimeCount,
              )
            : 0,
        avgDaysSentToDelivered:
          labTotals.deliveredLeadTimeCount > 0
            ? roundMoney(
                labTotals.deliveredLeadTimeSumDays / labTotals.deliveredLeadTimeCount,
              )
            : 0,
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
      topPatients: Array.from(byPatient.values())
        .map((row) => ({
          ...row,
          averageTicket: row.salesCount ? row.total / row.salesCount : 0,
        }))
        .sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          return b.salesCount - a.salesCount;
        })
        .slice(0, 12),
      dailySeries: Array.from(byDay.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }
}
