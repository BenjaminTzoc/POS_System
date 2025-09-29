import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from '../dto';
import { Permissions, Public } from '../decorators';

@Controller('users')
export class UsersController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post()
  // @Permissions('users.create')
  @HttpCode(HttpStatus.CREATED)
  createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.authService.createUser(dto);
  }

  @Get()
  @Public()
  // @Permissions('users.read')
  findAllUsers(): Promise<UserResponseDto[]> {
    return this.authService.findAllUsers();
  }

  @Get(':id')
  // @Permissions('users.read')
  findOneUser(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.authService.findOneUser(id);
  }

  @Get('email/:email')
  findUserByEmail(@Param('email') email: string): Promise<UserResponseDto> {
    return this.authService.findUserByEmail(email);
  }

  @Put(':id')
  // @Permissions('users.update')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.authService.updateUser(id, dto);
  }

  @Delete(':id')
  // @Permissions('users.delete')
  @HttpCode(HttpStatus.OK)
  removeUser(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.authService.removeUser(id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.OK)
  restoreUser(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.authService.restoreUser(id);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body('email') email: string,
    @Body('password') password: string,
  ): Promise<{ user: UserResponseDto, accessToken: string }> {
    return this.authService.validateUser(email, password);
  }
}
