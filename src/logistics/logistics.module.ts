import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Category, Inventory, InventoryMovement, Product, Unit, InventoryTransfer, InventoryTransferItem, Area } from './entities';
import { BranchController, CategoryController, InventoryController, InventoryMovementController, InventoryTransferController, UnitsController, AreaController, ProductController } from './controllers';
import { BranchService, CategoryService, FilesService, InventoryMovementService, InventoryService, InventoryTransferService, ProductService, UnitService, AreaService } from './services';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, Category, Product, Branch, Inventory, InventoryMovement, InventoryTransfer, InventoryTransferItem, Area]), AuthModule],
  controllers: [UnitsController, CategoryController, ProductController, BranchController, InventoryController, InventoryMovementController, InventoryTransferController, AreaController],
  providers: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService],
  exports: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService],
})
export class LogisticsModule {}
