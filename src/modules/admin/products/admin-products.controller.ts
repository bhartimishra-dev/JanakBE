import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminProductsService } from './admin-products.service';
import {
  AddProductDocumentsDto,
  AddProductImagesDto,
  CreateProductDto,
  ReorderProductImagesDto,
} from '../dto/create-product.dto';

@ApiTags('Admin - Products')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private adminProductsService: AdminProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with pagination, search, category and availability filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or model number' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'availability', required: false, enum: ['website', 'app', 'hidden', 'all'] })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('availability') availability?: 'website' | 'app' | 'hidden' | 'all',
  ) {
    return this.adminProductsService.findAll(page, limit, search, categoryId, availability);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail (admin)' })
  findOne(@Param('id') id: string) {
    return this.adminProductsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add new product' })
  create(@Body() dto: CreateProductDto) {
    return this.adminProductsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit product detail fields' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.adminProductsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string) {
    return this.adminProductsService.remove(id);
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Add image(s)/video(s) to a product' })
  addImages(@Param('id') id: string, @Body() dto: AddProductImagesDto) {
    return this.adminProductsService.addImages(id, dto);
  }

  @Patch(':id/images/reorder')
  @ApiOperation({ summary: 'Reorder a product\'s images/videos' })
  reorderImages(@Param('id') id: string, @Body() dto: ReorderProductImagesDto) {
    return this.adminProductsService.reorderImages(id, dto);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Remove an image/video from a product' })
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.adminProductsService.removeImage(id, imageId);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Add document(s) to a product' })
  addDocuments(@Param('id') id: string, @Body() dto: AddProductDocumentsDto) {
    return this.adminProductsService.addDocuments(id, dto);
  }

  @Delete(':id/documents/:documentId')
  @ApiOperation({ summary: 'Remove a document from a product' })
  removeDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.adminProductsService.removeDocument(id, documentId);
  }
}
