import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import slugify from 'slugify';
import { Brand } from '../../brands/entities/brand.entity';
import { CreateBrandDto } from '../dto/create-brand.dto';

@Injectable()
export class AdminBrandsService {
  constructor(
    @InjectRepository(Brand)
    private brandsRepository: Repository<Brand>,
  ) {}

  findAll(search?: string) {
    const qb = this.brandsRepository.createQueryBuilder('b').orderBy('b.name', 'ASC');
    if (search) {
      qb.andWhere('b.name ILIKE :search', { search: `%${search}%` });
    }
    return qb.getMany();
  }

  async findOne(id: string) {
    const brand = await this.brandsRepository.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(dto: CreateBrandDto) {
    const slug = slugify(dto.name, { lower: true, strict: true });
    const brand = this.brandsRepository.create({ ...dto, slug });
    return this.brandsRepository.save(brand);
  }

  async update(id: string, dto: Partial<CreateBrandDto>) {
    const brand = await this.findOne(id);
    if (dto.name) {
      brand.slug = slugify(dto.name, { lower: true, strict: true });
    }
    Object.assign(brand, dto);
    return this.brandsRepository.save(brand);
  }

  async remove(id: string) {
    const brand = await this.findOne(id);
    try {
      await this.brandsRepository.remove(brand);
    } catch (err) {
      // FK violation — products still reference this brand (no onDelete
      // cascade is configured on that relation, intentionally).
      if (err instanceof QueryFailedError && (err as any).code === '23503') {
        throw new ConflictException(
          `Cannot delete "${brand.name}" — one or more products still reference this brand. Move or delete them first.`,
        );
      }
      throw err;
    }
    return { message: 'Brand deleted' };
  }
}
