import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ProductionService } from '../services/production.service';
import { CreateDecompositionDto } from '../dto/decomposition.dto';
import { CreateProductionOrderDto, CompleteProductionOrderDto, CancelProductionOrderDto } from '../dto/production.dto';
import { CreateRecipeDto, UpdateRecipeDto } from '../dto/recipe.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/decorators';

@Controller('production')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post('decomposition')
  @Permissions('production.manage')
  async createDecomposition(@Body() dto: CreateDecompositionDto, @Req() req) {
    const userId = req.user?.id;
    return this.productionService.createDecomposition(dto, userId);
  }

  @Get('decomposition')
  @Permissions('production.manage')
  async findAllDecompositions() {
    return this.productionService.findAllDecompositions();
  }

  @Get('decomposition/:id')
  @Permissions('production.manage')
  async findOneDecomposition(@Param('id') id: string) {
    return this.productionService.findOneDecomposition(id);
  }

  @Post('recipes')
  @Permissions('production.manage')
  async createRecipe(@Body() dto: CreateRecipeDto) {
    return this.productionService.createRecipe(dto);
  }

  @Get('recipes/:productId')
  @Permissions('production.manage')
  async getRecipe(@Param('productId') productId: string) {
    return this.productionService.getRecipe(productId);
  }

  @Post('orders')
  @Permissions('production.manage')
  async createOrder(@Body() dto: CreateProductionOrderDto, @Req() req) {
    const userId = req.user?.id;
    return this.productionService.createProductionOrder(dto, userId);
  }

  @Get('orders')
  @Permissions('production.manage')
  async findAllOrders() {
    return this.productionService.findAllProductionOrders();
  }

  @Get('orders/:id')
  @Permissions('production.manage')
  async findOneOrder(@Param('id') id: string) {
    return this.productionService.findOneProductionOrder(id);
  }

  @Patch('orders/:id/complete')
  @Permissions('production.manage')
  async completeOrder(
    @Param('id') id: string,
    @Body() dto: CompleteProductionOrderDto,
    @Req() req,
  ) {
    const userId = req.user?.id;
    return this.productionService.completeProductionOrder(id, dto, userId);
  }

  @Patch('orders/:id/cancel')
  @Permissions('production.manage')
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelProductionOrderDto,
  ) {
    return this.productionService.cancelProductionOrder(id, dto);
  }

  @Delete('recipes/:id')
  @Permissions('production.manage')
  async deleteRecipe(@Param('id') id: string) {
    return this.productionService.deleteRecipe(id);
  }

  @Patch('recipes/:id')
  @Permissions('production.manage')
  async updateRecipe(@Param('id') id: string, @Body() dto: UpdateRecipeDto) {
    return this.productionService.updateRecipe(id, dto);
  }
}
