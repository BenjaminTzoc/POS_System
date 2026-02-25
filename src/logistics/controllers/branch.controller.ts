import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { BranchResponseDto, CreateBranchDto, UpdateBranchDto } from '../dto';
import { BranchService } from '../services';
import { Permissions } from 'src/auth/decorators';
import { User } from 'src/common/decorators/user.decorator';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @Permissions('branches.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBranchDto): Promise<BranchResponseDto> {
    return this.branchService.create(dto);
  }

  @Get()
  findAll(@Query('includeDeleted') includeDeleted: string, @User() user: any): Promise<BranchResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.branchService.findAll(showDeleted);
  }

  @Get('search')
  search(@Query('q') query: string, @Query('includeDeleted') includeDeleted: string, @User() user: any): Promise<BranchResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.branchService.searchBranches(query, showDeleted);
  }

  @Get('stats')
  getStats(): Promise<{ total: number; active: number; deleted: number }> {
    return this.branchService.getBranchesStats();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('includeDeleted') includeDeleted: string, @User() user: any): Promise<BranchResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.branchService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Permissions('branches.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto): Promise<BranchResponseDto> {
    return this.branchService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('branches.manage')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.branchService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('branches.manage')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<BranchResponseDto> {
    return this.branchService.restore(id);
  }
}
