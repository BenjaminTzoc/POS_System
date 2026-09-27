import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { BranchSettlementService } from '../services/branch-settlement.service';
import {
  CreateBranchSettlementDraftDto,
  ReceiveBranchSettlementDto,
  SubmitTodaySettlementDto,
  UpdateBranchSettlementDto,
} from '../dto/branch-settlement.dto';
import { BranchSettlementStatus } from '../entities/branch-settlement.entity';

@Controller('branch-settlements')
@UseGuards(JwtAuthGuard)
export class BranchSettlementController {
  constructor(private readonly settlementService: BranchSettlementService) {}

  @Get('today')
  today(
    @User() user: any,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
  ) {
    return this.settlementService.getOrCreateToday(user, branchId, date);
  }

  @Post('draft')
  createDraft(@User() user: any, @Body() dto: CreateBranchSettlementDraftDto) {
    return this.settlementService.getOrCreateToday(user, dto.branchId, dto.businessDate);
  }

  @Post('submit-today')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  submitToday(
    @User() user: any,
    @Body() body: Record<string, any>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const dto: SubmitTodaySettlementDto = {
      branchId: body.branchId || undefined,
      notes: body.notes || undefined,
      items: typeof body.items === 'string' ? JSON.parse(body.items) : body.items || [],
      incidents: typeof body.incidents === 'string' ? JSON.parse(body.incidents) : body.incidents || [],
    };
    const grouped: Express.Multer.File[][] = [];
    for (const file of files || []) {
      const match = /^incident_(\d+)$/.exec(file.fieldname);
      if (!match) continue;
      const index = Number(match[1]);
      if (!grouped[index]) grouped[index] = [];
      grouped[index].push(file);
    }
    return this.settlementService.submitToday(dto, user, grouped);
  }

  @Get()
  findAll(
    @User() user: any,
    @Query('branchId') branchId?: string,
    @Query('status') status?: BranchSettlementStatus,
  ) {
    return this.settlementService.findAll(user, branchId, status);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @User() user: any) {
    return this.settlementService.findOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchSettlementDto,
    @User() user: any,
  ) {
    return this.settlementService.updateDraft(id, dto, user);
  }

  @Post(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @User() user: any) {
    return this.settlementService.submit(id, user);
  }

  @Patch(':id/receive')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveBranchSettlementDto,
    @User() user: any,
  ) {
    return this.settlementService.receive(id, dto, user);
  }
}
