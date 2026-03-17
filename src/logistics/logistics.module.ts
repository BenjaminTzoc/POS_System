import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Category, Inventory, InventoryMovement, Product, Unit, InventoryTransfer, InventoryTransferItem, Area, RouteDispatch, RouteDispatchItem } from './entities';
import { BranchController, CategoryController, InventoryController, InventoryMovementController, InventoryTransferController, UnitsController, AreaController, ProductController, RouteDispatchController } from './controllers';
import { BranchService, CategoryService, FilesService, InventoryMovementService, InventoryService, InventoryTransferService, ProductService, UnitService, AreaService, RouteDispatchService } from './services';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, Category, Product, Branch, Inventory, InventoryMovement, InventoryTransfer, InventoryTransferItem, Area, RouteDispatch, RouteDispatchItem]), AuthModule],
  controllers: [UnitsController, CategoryController, ProductController, BranchController, InventoryController, InventoryMovementController, InventoryTransferController, AreaController, RouteDispatchController],
  providers: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService, RouteDispatchService],
  exports: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService, RouteDispatchService],
})
export class LogisticsModule {}
