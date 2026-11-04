import { Injectable } from '@nestjs/common';
import { InstanceManager } from '../world/instance-manager.service';

type CounterName =
  | 'cafe_joins_total'
  | 'cafe_leaves_total'
  | 'socket_disconnects_total'
  | 'socket_reconnects_total'
  | 'seat_claims_total'
  | 'seat_conflicts_total'
  | 'voice_joins_total'
  | 'voice_join_failures_total'
  | 'voice_tokens_issued_total'
  | 'chat_messages_total'
  | 'events_rejected_total'
  | 'events_rate_limited_total'
  | 'moderation_reports_total'
  | 'user_blocks_total'
  | 'screen_share_starts_total'
  | 'screen_share_stops_total'
  | 'screen_share_rejections_total';

/**
 * Operational metrics (SPEC 16.4). Deliberately counts and latencies only —
 * never message bodies, tokens or anything from a voice stream.
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<CounterName, number>();
  private readonly moveLatencies: number[] = [];

  constructor(private readonly instances: InstanceManager) {}

  increment(name: CounterName, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  observeMoveLatency(ms: number): void {
    this.moveLatencies.push(ms);
    if (this.moveLatencies.length > 500) this.moveLatencies.shift();
  }

  private percentile(p: number): number {
    if (this.moveLatencies.length === 0) return 0;
    const sorted = [...this.moveLatencies].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Number(sorted[index].toFixed(2));
  }

  snapshot() {
    const stats = this.instances.stats();
    return {
      ...stats,
      counters: Object.fromEntries(this.counters),
      moveLatencyMs: { p50: this.percentile(50), p95: this.percentile(95) },
    };
  }

  /** Prometheus text exposition, so this drops straight into a dashboard. */
  prometheus(): string {
    const stats = this.instances.stats();
    const lines: string[] = [
      '# HELP cafe_online_users Users currently present across all instances',
      '# TYPE cafe_online_users gauge',
      `cafe_online_users ${stats.onlineCount}`,
      '# HELP cafe_instances Open café instances',
      '# TYPE cafe_instances gauge',
      `cafe_instances ${stats.instanceCount}`,
      '# HELP cafe_seated_users Users currently sitting on a seat',
      '# TYPE cafe_seated_users gauge',
      `cafe_seated_users ${stats.seatedCount}`,
      '# HELP cafe_move_latency_ms Server-side age of accepted movement packets',
      '# TYPE cafe_move_latency_ms summary',
      `cafe_move_latency_ms{quantile="0.5"} ${this.percentile(50)}`,
      `cafe_move_latency_ms{quantile="0.95"} ${this.percentile(95)}`,
    ];
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
    }
    for (const occupancy of stats.occupancy) {
      lines.push(`cafe_instance_occupancy{instance="${occupancy.instanceId}"} ${occupancy.players}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
