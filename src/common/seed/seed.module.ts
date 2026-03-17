import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role, Permission } from '../../auth/entities';
import { Branch } from '../../logistics/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, Branch]),
  ],
  providers: [SeedService],
  controllers: [SeedController],
})
export class SeedModule {}
