import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from './entities/coupon.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon)
    private couponsRepository: Repository<Coupon>,
  ) {}

  /**
   * Coupons a customer can actually use right now: active, non-expired, and
   * either public or privately scoped to this user (e.g. a quote-linked
   * coupon). Excludes anyone else's private coupons.
   */
  async findAvailable(user: User) {
    const coupons = await this.couponsRepository.find({
      where: [
        { isActive: true, isPublic: true },
        { isActive: true, isPublic: false, user: { id: user.id } },
      ],
      relations: { freeProduct: true },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    return coupons
      .filter((coupon) => !coupon.expiresAt || coupon.expiresAt >= now)
      .map((coupon) => ({
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountPercent: coupon.discountPercent,
        maxDiscountAmount: coupon.maxDiscountAmount,
        additionalDiscountType: coupon.additionalDiscountType,
        minimumOrderValue: coupon.minimumOrderValue,
        isPublic: coupon.isPublic,
        expiresAt: coupon.expiresAt,
        freeProduct: coupon.freeProduct
          ? { id: coupon.freeProduct.id, name: coupon.freeProduct.name }
          : null,
      }));
  }

  async create(dto: CreateCouponDto) {
    const existing = await this.couponsRepository.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new ConflictException('Coupon code already exists');

    const coupon = new Coupon();
    coupon.code = dto.code.toUpperCase();
    coupon.discountPercent = dto.discountPercent;
    if (dto.expiresAt) coupon.expiresAt = new Date(dto.expiresAt);

    return this.couponsRepository.save(coupon);
  }

  async toggle(id: string) {
    const coupon = await this.couponsRepository.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    await this.couponsRepository.update(id, { isActive: !coupon.isActive });
    return this.couponsRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    const coupon = await this.couponsRepository.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    await this.couponsRepository.remove(coupon);
    return { message: 'Coupon deleted' };
  }

  async validate(code: string, user: User) {
    const coupon = await this.couponsRepository.findOne({
      where: { code: code.toUpperCase(), isActive: true },
      relations: { user: true, freeProduct: true },
    });
    if (!coupon) throw new BadRequestException('Invalid or inactive coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }
    // Same restriction cart.applyCoupon() and checkout.placeOrder() enforce — without
    // this check, a quote-linked/private coupon would validate as "success" for
    // anyone, then get rejected later at apply/checkout for a reason this endpoint
    // never surfaced.
    if (coupon.user && coupon.user.id !== user.id) {
      throw new BadRequestException('This coupon is not valid for your account');
    }

    return {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountPercent: coupon.discountPercent,
      maxDiscountAmount: coupon.maxDiscountAmount,
      additionalDiscountType: coupon.additionalDiscountType,
      minimumOrderValue: coupon.minimumOrderValue,
      isPublic: coupon.isPublic,
      freeProduct: coupon.freeProduct
        ? { id: coupon.freeProduct.id, name: coupon.freeProduct.name }
        : null,
    };
  }
}
