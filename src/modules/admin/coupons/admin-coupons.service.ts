import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CouponDiscountType } from '../../../common/enums/coupon-discount-type.enum';
import { CompanyProfile } from '../../company-profile/entities/company-profile.entity';
import { Coupon } from '../../coupons/entities/coupon.entity';
import { Product } from '../../products/entities/product.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { CreateCouponDto } from '../dto/create-coupon.dto';

@Injectable()
export class AdminCouponsService {
  constructor(
    @InjectRepository(Coupon)
    private couponsRepository: Repository<Coupon>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Quote)
    private quotesRepository: Repository<Quote>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
  ) {}

  findAll() {
    return this.couponsRepository.find({
      order: { createdAt: 'DESC' },
      relations: { freeProduct: true, quote: true, user: true },
    });
  }

  private buildSuggestedCode(customerName: string): string {
    const abbrev =
      customerName.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'CUST';
    const digits = String(Math.floor(100000 + Math.random() * 900000));
    return `Jnk-${abbrev}-${digits}`;
  }

  private async getCustomerNameForQuote(quote: Quote): Promise<string> {
    const profile = await this.companyProfileRepository.findOne({ where: { user: { id: quote.user.id } } });
    return profile?.companyName ?? quote.user?.email ?? 'CUST';
  }

  async suggestCode(quoteId: string): Promise<{ code: string }> {
    const quote = await this.quotesRepository.findOne({ where: { id: quoteId }, relations: { user: true } });
    if (!quote) throw new NotFoundException('Quote not found');
    return { code: this.buildSuggestedCode(await this.getCustomerNameForQuote(quote)) };
  }

  private async resolveRelations(dto: {
    discountType?: CouponDiscountType;
    discountValue?: number;
    additionalDiscountType?: CouponDiscountType;
    freeProductId?: string;
    isPublic?: boolean;
    quoteId?: string;
  }) {
    if (dto.discountType === CouponDiscountType.PERCENTAGE && dto.discountValue != null && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }

    if (dto.additionalDiscountType && dto.additionalDiscountType === CouponDiscountType.FREE_ITEM) {
      throw new BadRequestException('additionalDiscountType must be flat or percentage');
    }
    if (
      dto.additionalDiscountType === CouponDiscountType.PERCENTAGE &&
      dto.discountValue != null &&
      dto.discountValue > 100
    ) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }
    if (
      dto.discountType === CouponDiscountType.FREE_ITEM &&
      dto.additionalDiscountType &&
      dto.discountValue == null
    ) {
      throw new BadRequestException('discountValue is required when additionalDiscountType is set');
    }

    const relations: { freeProduct?: Product; quote?: Quote; user?: Quote['user'] } = {};

    if (dto.discountType === CouponDiscountType.FREE_ITEM && dto.freeProductId) {
      const freeProduct = await this.productsRepository.findOne({ where: { id: dto.freeProductId } });
      if (!freeProduct) throw new NotFoundException('Free item product not found');
      relations.freeProduct = freeProduct;
    }

    if (dto.isPublic === false && dto.quoteId) {
      const quote = await this.quotesRepository.findOne({ where: { id: dto.quoteId }, relations: { user: true } });
      if (!quote) throw new NotFoundException('Quote not found');
      relations.quote = quote;
      relations.user = quote.user;
    }

    return relations;
  }

  async create(dto: CreateCouponDto) {
    const relations = await this.resolveRelations(dto);

    let code = dto.code?.toUpperCase();
    if (!code) {
      if (dto.isPublic === false && relations.quote) {
        code = this.buildSuggestedCode(await this.getCustomerNameForQuote(relations.quote));
      } else {
        throw new BadRequestException('code is required');
      }
    }

    const existing = await this.couponsRepository.findOne({ where: { code } });
    if (existing) throw new ConflictException('Coupon code already exists');

    const { freeProductId, quoteId, ...fields } = dto;
    const coupon = this.couponsRepository.create({
      ...fields,
      code,
      // Kept in sync for any code still reading the legacy percentage-only field.
      discountPercent: dto.discountType === CouponDiscountType.PERCENTAGE ? dto.discountValue : undefined,
      ...relations,
    });
    return this.couponsRepository.save(coupon);
  }

  async update(id: string, dto: Partial<CreateCouponDto>) {
    const coupon = await this.couponsRepository.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (dto.code) dto.code = dto.code.toUpperCase();

    const relations = await this.resolveRelations({
      discountType: dto.discountType ?? coupon.discountType,
      discountValue: dto.discountValue ?? coupon.discountValue,
      additionalDiscountType: dto.additionalDiscountType ?? coupon.additionalDiscountType,
      freeProductId: dto.freeProductId,
      isPublic: dto.isPublic ?? coupon.isPublic,
      quoteId: dto.quoteId,
    });
    const { freeProductId, quoteId, ...fields } = dto;
    Object.assign(coupon, fields, relations);
    if (dto.discountType === CouponDiscountType.PERCENTAGE && dto.discountValue != null) {
      coupon.discountPercent = dto.discountValue;
    }
    return this.couponsRepository.save(coupon);
  }

  async remove(id: string) {
    const coupon = await this.couponsRepository.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    await this.couponsRepository.remove(coupon);
    return { message: 'Coupon deleted' };
  }
}
