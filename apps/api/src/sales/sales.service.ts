import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSaleDto,
  DiscountTypeDto,
  PaymentMethodDto,
} from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { VoidSaleDto } from './dto/void-sale.dto';
import { AddSalePaymentDto } from './dto/add-sale-payment.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActorSiteId(userId: string): Promise<string | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { siteId: true },
    });
    return actor?.siteId ?? null;
  }

  private readonly saleInclude = {
    patient: true,
    createdBy: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    },
    voidedBy: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    },
    items: { include: { frame: true } },
    lensItems: {
      include: {
        labOrder: {
          select: {
            id: true,
            reference: true,
            status: true,
          },
        },
      },
    },
    payments: {
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    },
  } as const;

  private mapPaymentMethod(pm?: PaymentMethodDto) {
    switch (pm) {
      case PaymentMethodDto.CARD:
        return 'CARD';
      case PaymentMethodDto.TRANSFER:
        return 'TRANSFER';
      case PaymentMethodDto.MIXED:
        return 'MIXED';
      case PaymentMethodDto.CASH:
      default:
        return 'CASH';
    }
  }

  private mapDiscountType(value?: DiscountTypeDto) {
    switch (value) {
      case DiscountTypeDto.PERCENT:
        return 'PERCENT' as const;
      case DiscountTypeDto.AMOUNT:
        return 'AMOUNT' as const;
      case DiscountTypeDto.NONE:
      default:
        return 'NONE' as const;
    }
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private parseDateBoundary(value: string, boundary: 'start' | 'end') {
    // If date-only format is used (YYYY-MM-DD), parse in local time
    // to avoid UTC offset shifting that can hide same-day records.
    if (value.length <= 10) {
      const [yearRaw, monthRaw, dayRaw] = value.split('-');
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const day = Number(dayRaw);
      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
      ) {
        throw new BadRequestException('Fecha invalida');
      }
      if (boundary === 'start') {
        return new Date(year, month - 1, day, 0, 0, 0, 0);
      }
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    return parsed;
  }

  private calculateSaleAmounts(subtotal: number, dto: CreateSaleDto) {
    const discountType = this.mapDiscountType(dto.discountType);
    const rawDiscountValue = Number(dto.discountValue ?? 0);
    const rawTaxPercent = Number(dto.taxPercent ?? 0);

    if (!Number.isFinite(rawDiscountValue) || rawDiscountValue < 0) {
      throw new BadRequestException(
        'El descuento debe ser un numero mayor o igual a 0',
      );
    }
    if (
      !Number.isFinite(rawTaxPercent) ||
      rawTaxPercent < 0 ||
      rawTaxPercent > 100
    ) {
      throw new BadRequestException('El impuesto debe estar entre 0 y 100');
    }

    let discountValue = this.roundMoney(rawDiscountValue);
    let discountAmount = 0;
    if (discountType === 'PERCENT') {
      if (discountValue > 100) {
        throw new BadRequestException(
          'El descuento porcentual no puede superar 100',
        );
      }
      discountAmount = this.roundMoney((subtotal * discountValue) / 100);
    } else if (discountType === 'AMOUNT') {
      if (discountValue > subtotal) {
        throw new BadRequestException(
          'El descuento en valor no puede superar el subtotal',
        );
      }
      discountAmount = this.roundMoney(discountValue);
    } else {
      discountValue = 0;
      discountAmount = 0;
    }

    const taxableBase = this.roundMoney(Math.max(0, subtotal - discountAmount));
    const taxPercent = this.roundMoney(rawTaxPercent);
    const taxAmount = this.roundMoney((taxableBase * taxPercent) / 100);
    const total = this.roundMoney(taxableBase + taxAmount);

    return {
      subtotal: this.roundMoney(subtotal),
      discountType,
      discountValue,
      discountAmount,
      taxPercent,
      taxAmount,
      total,
    };
  }

  async create(dto: CreateSaleDto, createdById: string) {
    const frameItems = dto.items ?? [];
    const lensItems = dto.lensItems ?? [];

    if (!frameItems.length && !lensItems.length) {
      throw new BadRequestException(
        'La venta debe tener al menos una montura o un lente de laboratorio',
      );
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, isActive: true, siteId: true },
    });
    if (!creator || !creator.isActive) {
      throw new BadRequestException(
        'Usuario creador no existe o esta inactivo',
      );
    }

    if (dto.patientId) {
      const p = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
        select: { id: true, siteId: true },
      });
      if (!p) throw new NotFoundException('Paciente no encontrado');
      if (creator.siteId && p.siteId && p.siteId !== creator.siteId) {
        throw new BadRequestException(
          'El paciente pertenece a una sede diferente',
        );
      }
    }

    const frameIds = Array.from(new Set(frameItems.map((i) => i.frameId)));
    const frames = await this.prisma.frame.findMany({
      where: { id: { in: frameIds } },
    });

    if (frames.length !== frameIds.length) {
      throw new BadRequestException('Uno o mas frameId no existen');
    }

    const computedFrameItems = frameItems.map((i) => {
      const frame = frames.find((f) => f.id === i.frameId);
      if (!frame) {
        throw new BadRequestException(`Frame ${i.frameId} no encontrado`);
      }
      if (i.quantity > frame.stockActual) {
        throw new BadRequestException(
          `Stock insuficiente para codigo ${frame.codigo} (${frame.referencia}). Stock=${frame.stockActual}, pedido=${i.quantity}`,
        );
      }
      const unitPrice = frame.precioVenta;
      const subtotal = unitPrice * i.quantity;
      return { frame, quantity: i.quantity, unitPrice, subtotal };
    });

    const labOrderIds = Array.from(
      new Set(
        lensItems
          .map((item) => item.labOrderId?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (labOrderIds.length > 0) {
      const existingLabOrders = await this.prisma.labOrder.findMany({
        where: { id: { in: labOrderIds } },
        select: { id: true },
      });
      if (existingLabOrders.length !== labOrderIds.length) {
        throw new BadRequestException(
          'Uno o mas labOrderId de lentes no existen',
        );
      }
    }

    const computedLensItems = lensItems.map((item, index) => {
      const description = item.description.trim();
      if (!description) {
        throw new BadRequestException(
          `El lente ${index + 1} debe tener una descripcion`,
        );
      }
      const unitSalePrice = this.roundMoney(item.unitSalePrice);
      const unitLabCost = this.roundMoney(item.unitLabCost);
      if (unitSalePrice < 0 || unitLabCost < 0) {
        throw new BadRequestException(
          `El lente ${index + 1} tiene valores invalidos`,
        );
      }
      const subtotalSale = this.roundMoney(unitSalePrice * item.quantity);
      const subtotalCost = this.roundMoney(unitLabCost * item.quantity);
      return {
        labOrderId: item.labOrderId?.trim() || null,
        description,
        quantity: item.quantity,
        unitSalePrice,
        unitLabCost,
        subtotalSale,
        subtotalCost,
      };
    });

    const frameSubtotal = this.roundMoney(
      computedFrameItems.reduce((acc, it) => acc + it.subtotal, 0),
    );
    const lensSubtotal = this.roundMoney(
      computedLensItems.reduce((acc, it) => acc + it.subtotalSale, 0),
    );
    const lensCostTotal = this.roundMoney(
      computedLensItems.reduce((acc, it) => acc + it.subtotalCost, 0),
    );
    const subtotal = this.roundMoney(frameSubtotal + lensSubtotal);
    const amounts = this.calculateSaleAmounts(subtotal, dto);
    const grossProfit = this.roundMoney(amounts.total - lensCostTotal);
    const hasAmountPaidInput =
      dto.amountPaidAtSale !== undefined && dto.amountPaidAtSale !== null;
    const hasCreditDueDateInput = Boolean(dto.creditDueDate?.trim());

    let paidAmount = amounts.total;
    if (hasAmountPaidInput) {
      const parsed = this.roundMoney(Number(dto.amountPaidAtSale));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new BadRequestException(
          'El abono inicial debe ser un numero mayor o igual a 0',
        );
      }
      if (parsed > amounts.total) {
        throw new BadRequestException(
          'El abono inicial no puede superar el total de la venta',
        );
      }
      paidAmount = parsed;
    } else if (hasCreditDueDateInput) {
      paidAmount = 0;
    }

    const balanceDue = this.roundMoney(Math.max(0, amounts.total - paidAmount));
    const paymentStatus =
      balanceDue === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';
    let creditDueDate: Date | null = null;
    if (hasCreditDueDateInput) {
      if (balanceDue <= 0) {
        throw new BadRequestException(
          'La fecha promesa de pago solo aplica cuando existe saldo pendiente',
        );
      }
      const parsedDate = new Date(dto.creditDueDate as string);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('creditDueDate invalida');
      }
      creditDueDate = parsedDate;
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          patientId: dto.patientId ?? null,
          paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
          frameSubtotal,
          lensSubtotal,
          subtotal: amounts.subtotal,
          discountType: amounts.discountType,
          discountValue: amounts.discountValue,
          discountAmount: amounts.discountAmount,
          taxPercent: amounts.taxPercent,
          taxAmount: amounts.taxAmount,
          lensCostTotal,
          grossProfit,
          paidAmount,
          balanceDue,
          paymentStatus,
          creditDueDate,
          total: amounts.total,
          notes: dto.notes ?? null,
          createdById,
          siteId: creator.siteId ?? null,
        },
      });

      for (const it of computedFrameItems) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            frameId: it.frame.id,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            frameId: it.frame.id,
            type: 'OUT',
            quantity: it.quantity,
            reason: `Venta ${sale.id}`,
          },
        });

        await tx.frame.update({
          where: { id: it.frame.id },
          data: { stockActual: { decrement: it.quantity } },
        });
      }

      for (const it of computedLensItems) {
        await tx.saleLensItem.create({
          data: {
            saleId: sale.id,
            labOrderId: it.labOrderId,
            description: it.description,
            quantity: it.quantity,
            unitSalePrice: it.unitSalePrice,
            unitLabCost: it.unitLabCost,
            subtotalSale: it.subtotalSale,
            subtotalCost: it.subtotalCost,
          },
        });
      }

      if (paidAmount > 0) {
        await tx.salePayment.create({
          data: {
            saleId: sale.id,
            amount: paidAmount,
            paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
            notes: 'Pago inicial',
            createdById,
          },
        });
      }

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: this.saleInclude,
      });
    });
  }

  async addPayment(
    saleId: string,
    dto: AddSalePaymentDto,
    actorUserId: string,
    actorRole: Role,
  ) {
    const actorSiteId = await this.getActorSiteId(actorUserId);
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, isActive: true },
    });
    if (!actor || !actor.isActive) {
      throw new BadRequestException(
        'Usuario que registra el abono no existe o esta inactivo',
      );
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        createdById: true,
        siteId: true,
        status: true,
        total: true,
        paidAmount: true,
        balanceDue: true,
      },
    });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    if (actorSiteId && sale.siteId && sale.siteId !== actorSiteId) {
      throw new NotFoundException('Venta no encontrada');
    }
    if (actorRole !== 'ADMIN' && sale.createdById !== actorUserId) {
      throw new ForbiddenException('No tienes permiso para abonar esta venta');
    }
    if (sale.status === 'VOIDED') {
      throw new BadRequestException('No puedes abonar una venta anulada');
    }
    if (sale.balanceDue <= 0) {
      throw new BadRequestException('Esta venta ya no tiene saldo pendiente');
    }

    const amount = this.roundMoney(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'El valor del abono debe ser un numero mayor que 0',
      );
    }
    if (amount > sale.balanceDue) {
      throw new BadRequestException(
        'El abono no puede superar el saldo pendiente',
      );
    }

    const nextPaidAmount = this.roundMoney(sale.paidAmount + amount);
    const nextBalanceDue = this.roundMoney(Math.max(0, sale.total - nextPaidAmount));
    const nextPaymentStatus =
      nextBalanceDue === 0 ? 'PAID' : nextPaidAmount > 0 ? 'PARTIAL' : 'PENDING';

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
          notes: dto.notes?.trim() || null,
          createdById: actorUserId,
        },
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: nextPaidAmount,
          balanceDue: nextBalanceDue,
          paymentStatus: nextPaymentStatus,
          creditDueDate: nextBalanceDue === 0 ? null : undefined,
        },
      });

      const updatedSale = await tx.sale.findUnique({
        where: { id: sale.id },
        include: this.saleInclude,
      });
      if (!updatedSale) {
        throw new NotFoundException('Venta no encontrada');
      }

      return {
        sale: updatedSale,
        payment,
      };
    });
  }

  async voidSale(
    id: string,
    dto: VoidSaleDto,
    actorUserId: string,
    actorRole: Role,
  ) {
    const actorSiteId = await this.getActorSiteId(actorUserId);
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            frame: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (actorSiteId && sale.siteId && sale.siteId !== actorSiteId) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.status === 'VOIDED') {
      throw new BadRequestException('La venta ya esta anulada');
    }

    if (actorRole !== 'ADMIN' && sale.createdById !== actorUserId) {
      throw new ForbiddenException('No tienes permiso para anular esta venta');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, isActive: true },
    });
    if (!actor || !actor.isActive) {
      throw new BadRequestException(
        'Usuario anulador no existe o esta inactivo',
      );
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Debes enviar el motivo de anulacion');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: reason,
          voidedById: actorUserId,
        },
      });

      for (const item of sale.items) {
        await tx.inventoryMovement.create({
          data: {
            frameId: item.frameId,
            type: 'IN',
            quantity: item.quantity,
            reason: `Anulacion venta ${sale.id}`,
          },
        });

        await tx.frame.update({
          where: { id: item.frameId },
          data: { stockActual: { increment: item.quantity } },
        });
      }

      return tx.sale.findUnique({
        where: { id: updatedSale.id },
        include: this.saleInclude,
      });
    });
  }

  async findAll(userId: string, role: Role, query: ListSalesQueryDto) {
    const actorSiteId = await this.getActorSiteId(userId);
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (query.fromDate) {
      fromDate = this.parseDateBoundary(query.fromDate, 'start');
    }
    if (query.toDate) {
      toDate = this.parseDateBoundary(query.toDate, 'end');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate no puede ser mayor que toDate');
    }

    const where = {
      ...(actorSiteId ? { siteId: actorSiteId } : {}),
      ...(role === 'ADMIN'
        ? query.createdById
          ? { createdById: query.createdById }
          : {}
        : { createdById: userId }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    return this.prisma.sale.findMany({
      where,
      take: query.limit ?? 120,
      orderBy: { createdAt: 'desc' },
      include: this.saleInclude,
    });
  }

  async findOne(id: string, userId: string, role: Role) {
    const actorSiteId = await this.getActorSiteId(userId);
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.saleInclude,
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (actorSiteId && sale.siteId && sale.siteId !== actorSiteId) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (role !== 'ADMIN' && sale.createdById !== userId) {
      throw new ForbiddenException('No tienes permiso para ver esta venta');
    }

    return sale;
  }
}
