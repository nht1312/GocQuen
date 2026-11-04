import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { MODERATION_REASONS, ModerationReason } from '@virtual-cafe/shared';
import { AuthedRequest, SessionGuard } from '../auth/session.guard';
import { MetricsService } from '../metrics/metrics.service';
import { Store } from '../storage/store';

const reportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.enum(MODERATION_REASONS as unknown as [ModerationReason, ...ModerationReason[]]),
  details: z.string().max(1000).optional(),
});

@Controller()
@UseGuards(SessionGuard)
export class ModerationController {
  constructor(
    private readonly store: Store,
    private readonly metrics: MetricsService,
  ) {}

  @Post('moderation/reports')
  async report(@Req() request: AuthedRequest, @Body() body: unknown) {
    const parsed = reportSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    if (parsed.data.reportedUserId === request.session.sub) {
      throw new BadRequestException('Bạn không thể báo cáo chính mình');
    }
    const record = await this.store.createReport({
      reporterUserId: request.session.sub,
      reportedUserId: parsed.data.reportedUserId,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    });
    this.metrics.increment('moderation_reports_total');
    return { id: record.id, status: record.status, createdAt: record.createdAt };
  }

  @Post('users/:id/block')
  async block(@Req() request: AuthedRequest, @Param('id') id: string) {
    if (id === request.session.sub) throw new BadRequestException('Bạn không thể chặn chính mình');
    await this.store.blockUser(request.session.sub, id);
    this.metrics.increment('user_blocks_total');
    return { blocked: true };
  }

  @Delete('users/:id/block')
  async unblock(@Req() request: AuthedRequest, @Param('id') id: string) {
    await this.store.unblockUser(request.session.sub, id);
    return { blocked: false };
  }

  @Get('me/blocks')
  async blocks(@Req() request: AuthedRequest) {
    return { blocked: await this.store.listBlocks(request.session.sub) };
  }
}
