import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
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

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx'];

const mediaStorage = diskStorage({
  destination: './public/uploads/products',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const mediaFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ext = extname(file.originalname).toLowerCase();
  if ([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(ext)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only JPG, PNG, WEBP images or MP4, MOV, WEBM videos are allowed'), false);
  }
};

const documentStorage = diskStorage({
  destination: './public/uploads/product-documents',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const documentFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ext = extname(file.originalname).toLowerCase();
  if (DOCUMENT_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only PDF, DOC, and DOCX documents are allowed'), false);
  }
};

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

  @Post('upload-images')
  @ApiOperation({
    summary: 'Upload one or more product images/videos, returns their URLs',
    description:
      'Upload files here first, then include the returned url/name/type entries in the images[] array of create/PATCH or POST :id/images.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', 10, { storage: mediaStorage, fileFilter: mediaFileFilter, limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No image/video files provided — send them as multipart/form-data field "images"');
    }
    return this.adminProductsService.uploadImages(files);
  }

  @Post('upload-documents')
  @ApiOperation({
    summary: 'Upload one or more product documents, returns their URLs',
    description: 'Upload files here first, then include the returned url/name entries in the documents[] array of create/PATCH or POST :id/documents.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { documents: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(
    FilesInterceptor('documents', 10, { storage: documentStorage, fileFilter: documentFileFilter, limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  uploadDocuments(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No document files provided — send them as multipart/form-data field "documents"');
    }
    return this.adminProductsService.uploadDocuments(files);
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
