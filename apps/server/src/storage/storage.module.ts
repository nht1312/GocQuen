import { Global, Module, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { MemoryStore } from './memory.store';
import { PostgresStore } from './postgres.store';
import { Store } from './store';

@Global()
@Module({
  providers: [
    AppConfig,
    {
      provide: Store,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Store =>
        config.databaseUrl ? new PostgresStore(config) : new MemoryStore(),
    },
  ],
  exports: [Store, AppConfig],
})
export class StorageModule implements OnModuleInit {
  constructor(private readonly store: Store) {}

  async onModuleInit(): Promise<void> {
    await this.store.init();
  }
}
