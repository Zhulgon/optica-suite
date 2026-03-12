import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('liveness')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get()
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const report = await this.healthService.getReadiness();
    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
