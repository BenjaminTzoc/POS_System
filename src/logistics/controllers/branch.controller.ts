import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { BranchResponseDto, CreateBranchDto, UpdateBranchDto } from '../dto';
import { BranchService } from '../services';
import { Public } from 'src/auth/decorators';

@Controller('branches')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBranchDto): Promise<BranchResponseDto> {
    return this.branchService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<BranchResponseDto[]> {
    return this.branchService.findAll();
  }

  @Get('search')
  @Public()
  search(@Query('q') query: string): Promise<BranchResponseDto[]> {
    return this.branchService.searchBranches(query);
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{ total: number; active: number; deleted: number }> {
    return this.branchService.getBranchesStats();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BranchResponseDto> {
    return this.branchService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchResponseDto> {
    return this.branchService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.branchService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<BranchResponseDto> {
    return this.branchService.restore(id);
  }
}
