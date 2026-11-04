import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { VoiceTokenResult } from '@virtual-cafe/shared';
import { AuthedRequest, SessionGuard } from '../auth/session.guard';
import { MetricsService } from '../metrics/metrics.service';
import { VoiceService } from './voice.service';

@Controller('voice')
@UseGuards(SessionGuard)
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly metrics: MetricsService,
  ) {}

  @Post('token')
  token(@Req() request: AuthedRequest): VoiceTokenResult {
    const result = this.voice.issueToken(request.session.sub, request.session.name);
    if (result.token) this.metrics.increment('voice_tokens_issued_total');
    else this.metrics.increment('voice_join_failures_total');
    return result;
  }
}
