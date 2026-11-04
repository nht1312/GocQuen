import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { SessionGuard } from './auth/session.guard';
import { SessionService } from './auth/session.service';
import { CafeController } from './cafe/cafe.controller';
import { AppConfig } from './config/app-config';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { ModerationController } from './moderation/moderation.controller';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { StorageModule } from './storage/storage.module';
import { VoiceController } from './voice/voice.controller';
import { VoiceService } from './voice/voice.service';
import { InstanceManager } from './world/instance-manager.service';

@Module({
  imports: [StorageModule],
  controllers: [
    AuthController,
    CafeController,
    VoiceController,
    ModerationController,
    MetricsController,
  ],
  providers: [
    AppConfig,
    SessionService,
    SessionGuard,
    InstanceManager,
    VoiceService,
    MetricsService,
    RealtimeGateway,
  ],
})
export class AppModule {}
