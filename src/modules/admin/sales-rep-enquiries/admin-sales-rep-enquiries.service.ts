import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesRepEnquiryStatus } from '../../../common/enums/sales-rep-enquiry-status.enum';
import { SalesRepEnquiry } from '../../sales-rep-enquiries/entities/sales-rep-enquiry.entity';
import { UpdateSalesRepEnquiryDto } from '../dto/update-sales-rep-enquiry.dto';

export interface PaginatedSalesRepEnquiries {
  enquiries: SalesRepEnquiry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts: Record<SalesRepEnquiryStatus, number>;
}

@Injectable()
export class AdminSalesRepEnquiriesService {
  constructor(
    @InjectRepository(SalesRepEnquiry)
    private enquiriesRepository: Repository<SalesRepEnquiry>,
  ) {}

  async findAll(
    page = 1,
    limit = 20,
    status?: SalesRepEnquiryStatus,
    search?: string,
    productId?: string,
    from?: string,
    to?: string,
  ): Promise<PaginatedSalesRepEnquiries> {
    const qb = this.enquiriesRepository
      .createQueryBuilder('e')
      .leftJoin('e.product', 'p')
      .addSelect(['p.id', 'p.slug'])
      .leftJoin('e.user', 'u')
      .addSelect(['u.id', 'u.email'])
      .orderBy('e.createdAt', 'DESC');

    if (status) qb.andWhere('e.status = :status', { status });
    if (productId) qb.andWhere('p.id = :productId', { productId });

    if (search) {
      qb.andWhere(
        `(LOWER(e.productName) LIKE LOWER(:search) OR LOWER(e.productCode) LIKE LOWER(:search)
          OR LOWER(e.salesRepName) LIKE LOWER(:search) OR LOWER(e.customerEmail) LIKE LOWER(:search)
          OR LOWER(e.customerName) LIKE LOWER(:search) OR e.customerPhone LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      qb.andWhere('e.createdAt >= :from', { from: start });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('e.createdAt <= :to', { to: end });
    }

    const [enquiries, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      enquiries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      statusCounts: await this.getStatusCounts(),
    };
  }

  private async getStatusCounts(): Promise<
    Record<SalesRepEnquiryStatus, number>
  > {
    const rows = await this.enquiriesRepository
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.status')
      .getRawMany<{ status: SalesRepEnquiryStatus; count: string }>();

    const counts = Object.fromEntries(
      Object.values(SalesRepEnquiryStatus).map((s) => [s, 0]),
    ) as Record<SalesRepEnquiryStatus, number>;
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async findOne(id: string) {
    const enquiry = await this.enquiriesRepository.findOne({
      where: { id },
      relations: { product: true, user: true },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    return enquiry;
  }

  async update(id: string, dto: UpdateSalesRepEnquiryDto) {
    const enquiry = await this.findOne(id);
    if (dto.status) enquiry.status = dto.status;
    if (dto.adminNotes !== undefined) enquiry.adminNotes = dto.adminNotes;
    return this.enquiriesRepository.save(enquiry);
  }

  async remove(id: string) {
    const enquiry = await this.findOne(id);
    await this.enquiriesRepository.remove(enquiry);
    return { message: 'Enquiry deleted' };
  }
}
