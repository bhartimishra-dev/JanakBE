import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { AdminBrandsService } from './admin-brands.service';

@ApiTags('Admin - Brands')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/brands')
export class AdminBrandsController {
  constructor(private adminBrandsService: AdminBrandsService) {}

  @Get()
  @ApiOperation({ summary: 'List brands' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by brand name' })
  findAll(@Query('search') search?: string) {
    return this.adminBrandsService.findAll(search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get brand detail' })
  findOne(@Param('id') id: string) {
    return this.adminBrandsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new brand' })
  create(@Body() dto: CreateBrandDto) {
    return this.adminBrandsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update brand' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateBrandDto>) {
    return this.adminBrandsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete brand' })
  remove(@Param('id') id: string) {
    return this.adminBrandsService.remove(id);
  }
}
