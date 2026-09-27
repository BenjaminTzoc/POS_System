import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { BranchSettlementService } from '../services/branch-settlement.service';
import {
  CreateBranchSettlementIncidentDto,
  ResolveBranchSettlementIncidentDto,
  UpdateBranchSettlementIncidentDto,
} from '../dto/branch-settlement.dto';

const incidentFiles = FilesInterceptor('attachments', 5, {
  storage: memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (!mime || mime === 'application/octet-stream' || mime.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new BadRequestException('Solo se permiten archivos de imagen'), false);
  },
});

@Controller('branch-settlements/:settlementId/incidents')
@UseGuards(JwtAuthGuard)
export class BranchSettlementIncidentsController {
  constructor(private readonly settlementService: BranchSettlementService) {}

  @Post()
  @UseInterceptors(incidentFiles)
  create(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: CreateBranchSettlementIncidentDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @User() user: any,
  ) {
    return this.settlementService.createIncident(settlementId, dto, user, files);
  }

  @Patch(':incidentId/resolve')
  resolve(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveBranchSettlementIncidentDto,
    @User() user: any,
  ) {
    return this.settlementService.resolveIncident(settlementId, incidentId, dto, user);
  }

  @Patch(':incidentId')
  @UseInterceptors(incidentFiles)
  update(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: UpdateBranchSettlementIncidentDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @User() user: any,
  ) {
    return this.settlementService.updateIncident(settlementId, incidentId, dto, user, files);
  }

  @Delete(':incidentId')
  remove(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @User() user: any,
  ) {
    return this.settlementService.deleteIncident(settlementId, incidentId, user);
  }
}
