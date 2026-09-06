import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  // `image` normalization (icon fallback + absolute URL) now lives on the
  // Category entity's @AfterLoad() hook, so it applies here and anywhere
  // else the entity is loaded (e.g. nested under a product).
  findAll() {
    return this.categoriesRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async findBySlug(slug: string) {
    const category = await this.categoriesRepository.findOne({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
