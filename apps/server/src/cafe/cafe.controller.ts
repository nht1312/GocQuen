import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CafeInfo, JoinResult, MAP_VERSION } from '@virtual-cafe/shared';
import { AuthedRequest, SessionGuard } from '../auth/session.guard';
import { AppConfig } from '../config/app-config';
import { MetricsService } from '../metrics/metrics.service';
import { InstanceManager, WORLD_ID } from '../world/instance-manager.service';

@Controller('cafe')
export class CafeController {
  constructor(
    private readonly instances: InstanceManager,
    private readonly config: AppConfig,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  info(): CafeInfo {
    const stats = this.instances.stats();
    return {
      worldId: WORLD_ID,
      name: 'Virtual Café',
      mapVersion: MAP_VERSION,
      onlineCount: stats.onlineCount,
      instanceCount: stats.instanceCount,
      capacityPerInstance: this.config.instanceCapacity,
      voiceAvailable: this.config.voiceAvailable,
    };
  }

  /**
   * Reserve a place in the café. The instance is chosen here, server-side; the
   * client is told which one only so it can display it (SPEC 11.3, 11.5).
   */
  @Post('join')
  @UseGuards(SessionGuard)
  join(@Req() request: AuthedRequest): JoinResult {
    const existing = this.instances.findInstanceOf(request.session.sub);
    const instance = existing ?? this.instances.assignInstance();
    return {
      instanceId: instance.id,
      realtimeUrl: '/',
      capacity: this.config.instanceCapacity,
      voiceAvailable: this.config.voiceAvailable,
    };
  }

  @Post('leave')
  @UseGuards(SessionGuard)
  leave(@Req() request: AuthedRequest): { left: boolean } {
    const result = this.instances.remove(request.session.sub);
    if (result) this.metrics.increment('cafe_leaves_total');
    return { left: Boolean(result) };
  }
}
