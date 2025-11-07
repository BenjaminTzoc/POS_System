import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { CreatePermissionDto, PermissionResponseDto, UpdatePermissionDto } from 'src/auth/dto';
import { Permissions, Public } from '../decorators';

@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Public()
  // @Permissions('permissions.create')
  @HttpCode(HttpStatus.CREATED)
  createPermission(@Body() dto: CreatePermissionDto): Promise<PermissionResponseDto> {
    return this.authService.createPermission(dto);
  }

  @Get()
  @Permissions('permissions.read')
  findAllPermissions(): Promise<PermissionResponseDto[]> {
    return this.authService.findAllPermissions();
  }

  @Get(':id')
  @Permissions('permissions.read')
  findOnePermission(@Param('id', ParseUUIDPipe) id: string): Promise<PermissionResponseDto> {
    return this.authService.findOnePermission(id);
  }

  @Put(':id')
  @Permissions('permissions.update')
  updatePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ): Promise<PermissionResponseDto> {
    return this.authService.updatePermission(id, dto);
  }

  @Delete(':id')
  @Permissions('permissions.delete')
  @HttpCode(HttpStatus.OK)
  removePermission(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.authService.removePermission(id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.OK)
  restorePermission(@Param('id', ParseUUIDPipe) id: string): Promise<PermissionResponseDto> {
    return this.authService.restorePermission(id);
  }
}
