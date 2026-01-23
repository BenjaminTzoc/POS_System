import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Branch,
  Category,
  Inventory,
  InventoryMovement,
  Product,
  Unit,
  InventoryTransfer,
  InventoryTransferItem,
} from './entities';
import {
  BranchController,
  CategoryController,
  InventoryController,
  InventoryMovementController,
  InventoryTransferController,
  ProductController,
  UnitsController,
} from './controllers';
import {
  BranchService,
  CategoryService,
  FilesService,
  InventoryMovementService,
  InventoryService,
  InventoryTransferService,
  ProductService,
  UnitService,
} from './services';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Unit,
      Category,
      Product,
      Branch,
      Inventory,
      InventoryMovement,
      InventoryTransfer,
      InventoryTransferItem,
    ]),
    AuthModule,
  ],
  controllers: [
    UnitsController,
    CategoryController,
    ProductController,
    BranchController,
    InventoryController,
    InventoryMovementController,
    InventoryTransferController,
  ],
  providers: [
    UnitService,
    CategoryService,
    ProductService,
    BranchService,
    InventoryService,
    InventoryMovementService,
    FilesService,
    InventoryTransferService,
  ],
  exports: [
    UnitService,
    CategoryService,
    ProductService,
    BranchService,
    InventoryService,
    InventoryMovementService,
    FilesService,
    InventoryTransferService,
  ],
})
export class LogisticsModule {}
