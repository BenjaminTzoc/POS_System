import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role, Permission } from '../../auth/entities';
import { Branch } from '../../logistics/entities';

import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, Branch]),
    AuthModule,
  ],
  providers: [SeedService],
  controllers: [SeedController],
})
export class SeedModule {}
