import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

function isWeakSecret(value?: string) {
  const secret = value?.trim() ?? '';
  if (!secret) return true;
  if (secret.length < 32) return true;
  const lowered = secret.toLowerCase();
  return (
    lowered === 'change-me' ||
    lowered === 'changeme' ||
    lowered.includes('demo') ||
    lowered.includes('default')
  );
}

function validateSecurityConfiguration() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  const webAppUrl = process.env.WEB_APP_URL?.trim() ?? '';
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE ?? 'lax')
    .trim()
    .toLowerCase();

  if (isWeakSecret(process.env.JWT_ACCESS_SECRET)) {
    throw new Error(
      'Configuracion insegura: JWT_ACCESS_SECRET debe tener al menos 32 caracteres robustos en produccion.',
    );
  }

  if (process.env.AUTH_COOKIE_SECURE !== 'true') {
    throw new Error(
      'Configuracion insegura: AUTH_COOKIE_SECURE debe ser true en produccion.',
    );
  }

  if (process.env.ADMIN_2FA_ENFORCED !== 'true') {
    throw new Error(
      'Configuracion insegura: ADMIN_2FA_ENFORCED debe ser true en produccion.',
    );
  }

  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error(
      'Configuracion invalida: AUTH_COOKIE_SAMESITE debe ser lax, strict o none.',
    );
  }

  if (sameSite === 'none' && process.env.AUTH_COOKIE_SECURE !== 'true') {
    throw new Error(
      'Configuracion insegura: AUTH_COOKIE_SECURE debe ser true cuando AUTH_COOKIE_SAMESITE=none.',
    );
  }

  if (!webAppUrl && corsOrigins.length === 0) {
    throw new Error(
      'Configuracion insegura: define WEB_APP_URL o CORS_ORIGINS en produccion.',
    );
  }

  if (
    process.env.ENABLE_SWAGGER === 'true' &&
    process.env.ALLOW_PROD_SWAGGER !== 'true'
  ) {
    throw new Error(
      'Configuracion insegura: ENABLE_SWAGGER=true en produccion requiere ALLOW_PROD_SWAGGER=true.',
    );
  }
}

async function bootstrap() {
  validateSecurityConfiguration();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const fallbackOrigins = isProduction
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const webAppUrl = process.env.WEB_APP_URL?.trim();
  const allowedOrigins = new Set<string>([
    ...configuredOrigins,
    ...(webAppUrl ? [webAppUrl] : []),
    ...fallbackOrigins,
  ]);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const enableSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Optica Suite API')
      .setDescription('API para gestion de pacientes e historias clinicas')
      .setVersion('1.0.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
