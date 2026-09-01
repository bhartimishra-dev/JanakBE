import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import { generateUniqueEntityCode } from '../../../common/utils/code-generator.util';
import { Brand } from '../../brands/entities/brand.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductDocument } from '../../products/entities/product-document.entity';
import { ProductImage } from '../../products/entities/product-image.entity';
import { ProductSpec } from '../../products/entities/product-spec.entity';
import { Product } from '../../products/entities/product.entity';
import {
  AddProductDocumentsDto,
  AddProductImagesDto,
  CreateProductDto,
  ReorderProductImagesDto,
} from '../dto/create-product.dto';

@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Brand)
    private brandsRepository: Repository<Brand>,
    @InjectRepository(ProductImage)
    private imagesRepository: Repository<ProductImage>,
    @InjectRepository(ProductSpec)
    private specsRepository: Repository<ProductSpec>,
    @InjectRepository(ProductDocument)
    private documentsRepository: Repository<ProductDocument>,
  ) {}

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    categoryId?: string,
    availability?: 'website' | 'app' | 'hidden' | 'all',
  ) {
    const qb = this.productsRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoinAndSelect('p.images', 'images')
      .orderBy('p.updatedAt', 'DESC');

    if (search) {
      qb.andWhere('(p.name ILIKE :search OR p.modelNumber ILIKE :search)', { search: `%${search}%` });
    }
    if (categoryId) {
      qb.andWhere('category.id = :categoryId', { categoryId });
    }
    if (availability === 'website') {
      qb.andWhere('p.showOnWebsite = true');
    } else if (availability === 'app') {
      qb.andWhere('p.showOnApp = true');
    } else if (availability === 'hidden') {
      qb.andWhere('p.showOnWebsite = false AND p.showOnApp = false');
    }

    const [products, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: { category: true, brand: true, images: true, specs: true, documents: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    const category = await this.categoriesRepository.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const brand = await this.brandsRepository.findOne({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const { images, specs, documents, ...productFields } = dto;
    const slug = slugify(dto.name, { lower: true, strict: true });
    const productCode = await generateUniqueEntityCode((code) =>
      this.productsRepository.existsBy({ productCode: code }),
    );
    const product = this.productsRepository.create({
      ...productFields,
      slug,
      productCode,
      category,
      brand,
    });
    const saved = await this.productsRepository.save(product);

    if (images?.length) {
      const rows = images.map((img) => this.imagesRepository.create({ ...img, product: saved }));
      await this.imagesRepository.save(rows);
    }
    if (specs?.length) {
      const rows = specs.map((spec) => this.specsRepository.create({ ...spec, product: saved }));
      await this.specsRepository.save(rows);
    }
    if (documents?.length) {
      const rows = documents.map((doc) => this.documentsRepository.create({ ...doc, product: saved }));
      await this.documentsRepository.save(rows);
    }
    return this.findOne(saved.id);
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    const product = await this.findOne(id);
    // images/specs/documents are managed through their own dedicated endpoints below,
    // so they're intentionally excluded from this scalar-field update.
    const { categoryId, brandId, images, specs, documents, ...fields } = dto;

    if (categoryId) {
      const category = await this.categoriesRepository.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Category not found');
      product.category = category;
    }
    if (brandId) {
      const brand = await this.brandsRepository.findOne({ where: { id: brandId } });
      if (!brand) throw new NotFoundException('Brand not found');
      product.brand = brand;
    }
    if (fields.name) {
      product.slug = slugify(fields.name, { lower: true, strict: true });
    }

    Object.assign(product, fields);
    await this.productsRepository.save(product);
    return this.findOne(id);
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productsRepository.remove(product);
    return { message: 'Product deleted' };
  }

  async addImages(productId: string, dto: AddProductImagesDto) {
    const product = await this.findOne(productId);
    const startOrder = product.images?.length ?? 0;
    const rows = dto.images.map((img, index) =>
      this.imagesRepository.create({ ...img, sortOrder: img.sortOrder ?? startOrder + index, product }),
    );
    await this.imagesRepository.save(rows);
    return this.findOne(productId);
  }

  async reorderImages(productId: string, dto: ReorderProductImagesDto) {
    const product = await this.findOne(productId);
    const validIds = new Set(product.images.map((img) => img.id));
    const unknown = dto.imageIds.filter((imgId) => !validIds.has(imgId));
    if (unknown.length) {
      throw new NotFoundException(`Image(s) not found on this product: ${unknown.join(', ')}`);
    }
    await Promise.all(
      dto.imageIds.map((imgId, index) => this.imagesRepository.update(imgId, { sortOrder: index })),
    );
    return this.findOne(productId);
  }

  async removeImage(productId: string, imageId: string) {
    const product = await this.findOne(productId);
    const image = product.images.find((img) => img.id === imageId);
    if (!image) throw new NotFoundException('Image not found on this product');
    await this.imagesRepository.remove(image);
    return { message: 'Image deleted' };
  }

  async addDocuments(productId: string, dto: AddProductDocumentsDto) {
    const product = await this.findOne(productId);
    const rows = dto.documents.map((doc) => this.documentsRepository.create({ ...doc, product }));
    await this.documentsRepository.save(rows);
    return this.findOne(productId);
  }

  async removeDocument(productId: string, documentId: string) {
    const product = await this.findOne(productId);
    const document = product.documents.find((doc) => doc.id === documentId);
    if (!document) throw new NotFoundException('Document not found on this product');
    await this.documentsRepository.remove(document);
    return { message: 'Document deleted' };
  }
}
