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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { AdminCategoriesService } from './admin-categories.service';

const storage = diskStorage({
  destination: './public/uploads/category-images',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  if (allowed.includes(extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WEBP images are allowed'), false);
  }
};

const imageUpload = () =>
  UseInterceptors(FileInterceptor('image', { storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }));

const categoryFormBody = () =>
  ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        image: { type: 'string', format: 'binary', description: 'Upload a file, or omit and send an image URL instead' },
        isActive: { type: 'boolean' },
        showOnWebsite: { type: 'boolean' },
        showOnApp: { type: 'boolean' },
        sortOrder: { type: 'number' },
      },
    },
  });

@ApiTags('Admin - Categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private adminCategoriesService: AdminCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories with pagination, search and availability filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by category code or name' })
  @ApiQuery({ name: 'availability', required: false, enum: ['website', 'app', 'hidden', 'all'] })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('availability') availability?: 'website' | 'app' | 'hidden' | 'all',
  ) {
    return this.adminCategoriesService.findAll(page, limit, search, availability);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category detail' })
  findOne(@Param('id') id: string) {
    return this.adminCategoriesService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create new category',
    description: 'Send multipart/form-data with an "image" file to upload directly, or JSON with an image URL — both work.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @categoryFormBody()
  @imageUpload()
  create(@Body() dto: CreateCategoryDto, @UploadedFile() file?: Express.Multer.File) {
    return this.adminCategoriesService.create(dto, file);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update category',
    description: 'Send multipart/form-data with an "image" file to replace it directly, or JSON with an image URL — both work.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @categoryFormBody()
  @imageUpload()
  update(@Param('id') id: string, @Body() dto: Partial<CreateCategoryDto>, @UploadedFile() file?: Express.Multer.File) {
    return this.adminCategoriesService.update(id, dto, file);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete category' })
  remove(@Param('id') id: string) {
    return this.adminCategoriesService.remove(id);
  }

  @Post('upload-image')
  @ApiOperation({
    summary: 'Upload a category image standalone, returns its URL',
    description: 'Only needed if you want to upload an image separately from create/update (e.g. to preview it first) — create/update now accept the file directly too.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @imageUpload()
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image file provided — send it as multipart/form-data field "image"');
    return { url: `/uploads/category-images/${file.filename}`, name: file.originalname };
  }
}
