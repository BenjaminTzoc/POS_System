import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Category, Inventory, InventoryMovement, Product, Unit } from './entities';
import { BranchController, CategoryController, InventoryController, InventoryMovementController, ProductController, UnitsController } from './controllers';
import { BranchService, CategoryService, InventoryMovementService, InventoryService, ProductService, UnitService } from './services';

@Module({
  imports: [TypeOrmModule.forFeature([
    Unit,
    Category,
    Product,
    Branch,
    Inventory,
    InventoryMovement,
  ])],
  controllers: [UnitsController, CategoryController, ProductController, BranchController, InventoryController, InventoryMovementController],
  providers: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService],
  exports: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService],
})
export class LogisticsModule {}
