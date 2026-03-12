import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health/liveness (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/health/liveness');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks.api).toBe('ok');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('checks.database.status');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('returns requestId on not-found', async () => {
    const response = await request(app.getHttpServer()).get('/not-found');
    expect(response.status).toBe(404);
    expect(response.body.requestId).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });
});
