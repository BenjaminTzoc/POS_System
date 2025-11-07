import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CreateRoleDto, RoleResponseDto, UpdateRoleDto } from '../dto';
import { AuthService } from '../auth.service';
import { Permissions, Public } from '../decorators';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Public()
  // @Permissions('roles.create')
  @HttpCode(HttpStatus.CREATED)
  createRole(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.authService.createRole(dto);
  }

  @Get()
  @Public()
  // @Permissions('roles.read')
  findAllRoles(): Promise<RoleResponseDto[]> {
    return this.authService.findAllRoles();
  }

  @Get(':id')
  @Permissions('roles.read')
  findOneRole(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.authService.findOneRole(id);
  }

  @Put(':id')
  @Permissions('roles.update')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.authService.updateRole(id, dto);
  }

  @Delete(':id')
  @Permissions('roles.delete')
  @HttpCode(HttpStatus.OK)
  removeRole(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.authService.removeRole(id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.OK)
  restoreRole(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.authService.restoreRole(id);
  }
}
