import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Critical Flows (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  const unique = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const email = `e2e_${unique}@optica.local`;
  const password = 'E2ePass123';

  let userId = '';
  let patientId = '';
  let frameId = '';
  let accessToken = '';
  let refreshToken = '';

  beforeAll(async () => {
    await prisma.$connect();

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: 'E2E User',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    userId = user.id;

    const frame = await prisma.frame.create({
      data: {
        codigo: Number(unique.slice(-6)),
        referencia: `E2E-${unique}`,
        segmento: 'HOMBRE',
        conPlaqueta: true,
        precioVenta: 150000,
        stockActual: 5,
      },
      select: { id: true },
    });
    frameId = frame.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (patientId) {
      await prisma.clinicalHistory.deleteMany({ where: { patientId } });
      await prisma.sale.deleteMany({ where: { patientId } });
      await prisma.patient.deleteMany({ where: { id: patientId } });
    }
    if (frameId) {
      await prisma.frame.deleteMany({ where: { id: frameId } });
    }
    if (userId) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    if (app) await app.close();
    await prisma.$disconnect();
  });

  it('login -> create patient -> create sale -> create clinical history -> refresh -> logout all', async () => {
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password,
    });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeDefined();

    accessToken = loginRes.body.accessToken;
    refreshToken = loginRes.body.refreshToken;

    const patientRes = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Paciente',
        lastName: 'E2E',
        documentNumber: unique,
        phone: '3001234567',
        email: `p_${unique}@mail.com`,
        occupation: 'Tester',
      });

    expect(patientRes.status).toBe(201);
    expect(patientRes.body.success).toBe(true);
    patientId = patientRes.body.data.id;
    expect(patientId).toBeDefined();

    const saleRes = await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        paymentMethod: 'CASH',
        notes: 'E2E sale',
        items: [{ frameId, quantity: 1 }],
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.id).toBeDefined();
    expect(Number(saleRes.body.total)).toBeGreaterThan(0);

    const clinicalRes = await request(app.getHttpServer())
      .post('/clinical-histories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        motivoConsulta: 'Control E2E',
        diagnostico: 'Miopia',
        disposicion: 'Lentes',
      });

    expect(clinicalRes.status).toBe(201);
    expect(clinicalRes.body.id).toBeDefined();

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(201);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();

    accessToken = refreshRes.body.accessToken;
    refreshToken = refreshRes.body.refreshToken;

    const logoutAllRes = await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(logoutAllRes.status).toBe(201);
    expect(logoutAllRes.body.success).toBe(true);

    const oldAccessRes = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(oldAccessRes.status).toBe(401);

    const oldRefreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(oldRefreshRes.status).toBe(401);
  });
});
