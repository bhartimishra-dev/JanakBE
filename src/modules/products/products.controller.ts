import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ProductFiltersDto } from './dto/product-filters.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all products with filters' })
  findAll(@Query() filters: ProductFiltersDto) {
    return this.productsService.findAll(filters);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get product detail by ID' })
  @ApiQuery({ name: 'platform', enum: ['website', 'app'], required: false })
  findOne(@Param('id') id: string, @Query('platform') platform?: 'website' | 'app') {
    return this.productsService.findOne(id, platform);
  }

  @Public()
  @Get(':id/related')
  @ApiOperation({ summary: 'Get related products' })
  @ApiQuery({ name: 'platform', enum: ['website', 'app'], required: false })
  findRelated(@Param('id') id: string, @Query('platform') platform?: 'website' | 'app') {
    return this.productsService.findRelated(id, platform);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Get product reviews' })
  getReviews(@Param('id') id: string) {
    return this.productsService.getReviews(id);
  }

  @Post(':id/reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a product review' })
  createReview(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateReviewDto,
  ) {
    return this.productsService.createReview(id, user, dto);
  }

  @Public()
  @Get(':id/documents')
  @ApiOperation({ summary: 'Get downloadable documents for a product' })
  getDocuments(@Param('id') id: string) {
    return this.productsService.getDocuments(id);
  }
}
