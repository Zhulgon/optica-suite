import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';

export interface CreateAuditLogInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
  ipAddress?: string | string[] | null;
  userAgent?: string | string[] | null;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private toJson(payload: unknown): Prisma.InputJsonValue | undefined {
    if (payload === undefined) return undefined;
    const safe = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
    return safe;
  }

  async log(input: CreateAuditLogInput) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          actorEmail: input.actorEmail ?? null,
          actorRole: input.actorRole ?? null,
          module: input.module,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          payloadJson: this.toJson(input.payload),
          ipAddress: Array.isArray(input.ipAddress)
            ? input.ipAddress.join(', ')
            : (input.ipAddress ?? null),
          userAgent: Array.isArray(input.userAgent)
            ? input.userAgent.join(', ')
            : (input.userAgent ?? null),
        },
      });
    } catch (error) {
      // Audit failures should not break core business actions.
      console.error('AUDIT_LOG_ERROR', error);
    }
  }

  async findAll(query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const skip = (page - 1) * limit;

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('El parametro "from" no puede ser mayor que "to"');
    }

    const q = query.q?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { module: { contains: q, mode: 'insensitive' } },
              { action: { contains: q, mode: 'insensitive' } },
              { entityType: { contains: q, mode: 'insensitive' } },
              { entityId: { contains: q, mode: 'insensitive' } },
              { actorEmail: { contains: q, mode: 'insensitive' } },
              {
                actorUser: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
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
