import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('health')
  health() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  prometheus(): string {
    return this.metrics.prometheus();
  }

  @Get('metrics.json')
  json() {
    return this.metrics.snapshot();
  }
}
