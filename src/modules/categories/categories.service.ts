import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private configService: ConfigService,
  ) {}

  private toAbsoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3001');
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  // `icon` predates `image` and is kept (not dropped) so existing rows aren't lost —
  // fall back to it here until every category has been re-saved with `image` set.
  // Also upgrades older relative-path values to full absolute URLs.
  private applyImageFallback(category: Category): Category {
    if (!category.image && category.icon) category.image = category.icon;
    if (category.image) category.image = this.toAbsoluteUrl(category.image);
    return category;
  }

  async findAll() {
    const categories = await this.categoriesRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    return categories.map((c) => this.applyImageFallback(c));
  }

  async findBySlug(slug: string) {
    const category = await this.categoriesRepository.findOne({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return this.applyImageFallback(category);
  }
}
