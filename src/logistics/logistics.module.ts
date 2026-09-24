import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Category, Inventory, InventoryMovement, Product, Unit, InventoryTransfer, InventoryTransferItem, Area, RouteDispatch, RouteDispatchItem, Truck, Trip, TripItem, TripReturn, TripReturnItem, TripIncident } from './entities';
import { BranchController, CategoryController, InventoryController, InventoryMovementController, InventoryTransferController, UnitsController, AreaController, ProductController, RouteDispatchController, TruckController, TripController } from './controllers';
import { BranchService, CategoryService, FilesService, InventoryMovementService, InventoryService, InventoryTransferService, ProductService, UnitService, AreaService, RouteDispatchService, TruckService, TripService } from './services';
import { TripGateway } from './gateway/trip.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'src/auth/entities';
import { Sale } from 'src/sales/entities/sale.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, Category, Product, Branch, Inventory, InventoryMovement, InventoryTransfer, InventoryTransferItem, Area, RouteDispatch, RouteDispatchItem, Truck, Trip, TripItem, TripReturn, TripReturnItem, TripIncident, User, Sale]), AuthModule],
  controllers: [UnitsController, CategoryController, ProductController, BranchController, InventoryController, InventoryMovementController, InventoryTransferController, AreaController, RouteDispatchController, TruckController, TripController],
  providers: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService, RouteDispatchService, TruckService, TripService, TripGateway],
  exports: [UnitService, CategoryService, ProductService, BranchService, InventoryService, InventoryMovementService, FilesService, InventoryTransferService, AreaService, RouteDispatchService, TruckService, TripService, TripGateway],
})
export class LogisticsModule {}
