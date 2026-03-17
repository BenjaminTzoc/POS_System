import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductRecipe, ProductionOrder, DecompositionOrder, DecompositionItem } from './entities';
import { LogisticsModule } from '../logistics/logistics.module';
import { AuthModule } from '../auth/auth.module';
import { ProductionService } from './services/production.service';
import { ProductionController } from './controllers/production.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductRecipe,
      ProductionOrder,
      DecompositionOrder,
      DecompositionItem,
    ]),
    LogisticsModule,
    AuthModule,
  ],
  providers: [ProductionService],
  controllers: [ProductionController],
  exports: [ProductionService, TypeOrmModule],
})
export class ProductionModule {}
