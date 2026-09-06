import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import slugify from 'slugify';
import { generateUniqueEntityCode } from '../../../common/utils/code-generator.util';
import { Category } from '../../categories/entities/category.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';

@Injectable()
export class AdminCategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private configService: ConfigService,
  ) {}

  private toAbsoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path; // already absolute (e.g. an external URL)
    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3001');
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async mapProductQty(categories: Category[]): Promise<Category[]> {
    if (!categories.length) return categories;
    const ids = categories.map((c) => c.id);
    const counts = await this.categoryRepository
      .createQueryBuilder('c')
      .leftJoin('c.products', 'p')
      .select('c.id', 'categoryId')
      .addSelect('COUNT(p.id)', 'productQty')
      .where('c.id IN (:...ids)', { ids })
      .groupBy('c.id')
      .getRawMany<{ categoryId: string; productQty: string }>();
    const countMap = new Map(counts.map((row) => [row.categoryId, parseInt(row.productQty, 10)]));
    categories.forEach((c) => {
      c.productQty = countMap.get(c.id) ?? 0;
    });
    return categories;
  }

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    availability?: 'website' | 'app' | 'hidden' | 'all',
  ) {
    const qb = this.categoryRepository
      .createQueryBuilder('c')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.name', 'ASC');

    if (search) {
      qb.andWhere('(c.categoryCode ILIKE :search OR c.name ILIKE :search)', { search: `%${search}%` });
    }
    if (availability === 'website') {
      qb.andWhere('c.showOnWebsite = true');
    } else if (availability === 'app') {
      qb.andWhere('c.showOnApp = true');
    } else if (availability === 'hidden') {
      qb.andWhere('c.showOnWebsite = false AND c.showOnApp = false');
    }

    const [categories, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.mapProductQty(categories);

    return {
      categories,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const cat = await this.categoryRepository.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.mapProductQty([cat]);
    return cat;
  }

  private buildCategoryImageUrl(filename: string): string {
    return this.toAbsoluteUrl(`/uploads/category-images/${filename}`);
  }

  /**
   * An uploaded file (when present) always wins over a URL string in dto.image.
   * Stores the relative path — Category's @AfterLoad() normalizes it to
   * absolute on every subsequent read, so it's never baked in stale here.
   */
  private resolveImage(dto: Partial<CreateCategoryDto>, file?: Express.Multer.File): string | undefined {
    if (file) return `/uploads/category-images/${file.filename}`;
    return dto.image;
  }

  /** Standalone upload — used by the optional POST /admin/categories/upload-image endpoint. */
  uploadImage(file: Express.Multer.File) {
    return { url: this.buildCategoryImageUrl(file.filename), name: file.originalname };
  }

  async create(dto: CreateCategoryDto, file?: Express.Multer.File) {
    const slug = slugify(dto.name, { lower: true, strict: true });
    const categoryCode = await generateUniqueEntityCode((code) =>
      this.categoryRepository.existsBy({ categoryCode: code }),
    );
    const image = this.resolveImage(dto, file);
    const cat = this.categoryRepository.create({ ...dto, image, slug, categoryCode });
    const saved = await this.categoryRepository.save(cat);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: Partial<CreateCategoryDto>, file?: Express.Multer.File) {
    const cat = await this.findOne(id);
    if (dto.name) {
      cat.slug = slugify(dto.name, { lower: true, strict: true });
    }
    const image = this.resolveImage(dto, file);
    Object.assign(cat, dto, image !== undefined ? { image } : {});
    await this.categoryRepository.save(cat);
    return this.findOne(id);
  }

  async remove(id: string) {
    const cat = await this.findOne(id);
    try {
      await this.categoryRepository.remove(cat);
    } catch (err) {
      // FK violation — this category still has products pointing to it (no
      // onDelete cascade is configured on that relation, intentionally).
      if (err instanceof QueryFailedError && (err as any).code === '23503') {
        throw new ConflictException(
          `Cannot delete "${cat.name}" — ${cat.productQty ?? 'some'} product(s) still reference this category. Move or delete them first.`,
        );
      }
      throw err;
    }
    return { message: 'Category deleted' };
  }
}
