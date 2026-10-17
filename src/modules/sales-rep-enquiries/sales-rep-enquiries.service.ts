import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { CompanyProfile } from '../company-profile/entities/company-profile.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SalesRepEnquiry } from './entities/sales-rep-enquiry.entity';

/** Repeat clicks on the same product by the same visitor within this window are not recorded again. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class SalesRepEnquiriesService {
  constructor(
    @InjectRepository(SalesRepEnquiry)
    private enquiriesRepository: Repository<SalesRepEnquiry>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
  ) {}

  async create(productId: string, caller: User | JwtPayload | null) {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
      relations: { brand: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const isGuest = caller?.role === UserRole.GUEST;
    const user = caller && !isGuest ? (caller as User) : null;
    const guestId = isGuest ? (caller as JwtPayload).sub : null;

    if (user || guestId) {
      const recent = await this.enquiriesRepository.findOne({
        where: {
          product: { id: product.id },
          ...(user ? { user: { id: user.id } } : { guestId: guestId! }),
          createdAt: MoreThan(new Date(Date.now() - DEDUPE_WINDOW_MS)),
        },
      });
      if (recent) return this.toResponse(product);
    }

    const profile = user
      ? await this.companyProfileRepository.findOne({
          where: { user: { id: user.id } },
        })
      : null;

    await this.enquiriesRepository.save(
      this.enquiriesRepository.create({
        product,
        productName: product.name,
        productCode: product.productCode ?? null,
        modelNumber: product.modelNumber ?? null,
        brandName: product.brand?.name ?? null,
        categoryName: product.category?.name ?? null,
        price: product.price,
        salesRepName: product.salesRepName ?? null,
        salesRepPhone: product.salesRepPhone ?? null,
        user,
        guestId,
        customerEmail: user?.email ?? null,
        customerName: profile?.companyName ?? null,
        customerPhone: profile?.phone ?? null,
      }),
    );
    return this.toResponse(product);
  }

  /** Returns the rep's contact details so the frontend can show/dial them after logging the click. */
  private toResponse(product: Product) {
    return {
      salesRepName: product.salesRepName ?? null,
      salesRepPhone: product.salesRepPhone ?? null,
    };
  }
}
