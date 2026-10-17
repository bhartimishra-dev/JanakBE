import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactEnquiryStatus } from '../../../common/enums/contact-enquiry-status.enum';
import { ContactEnquiry } from '../../contact/entities/contact-enquiry.entity';
import { UpdateContactEnquiryDto } from '../dto/update-contact-enquiry.dto';

export interface PaginatedContactEnquiries {
  enquiries: ContactEnquiry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts: Record<ContactEnquiryStatus, number>;
}

@Injectable()
export class AdminContactEnquiriesService {
  constructor(
    @InjectRepository(ContactEnquiry)
    private enquiriesRepository: Repository<ContactEnquiry>,
  ) {}

  async findAll(
    page = 1,
    limit = 20,
    status?: ContactEnquiryStatus,
    search?: string,
    from?: string,
    to?: string,
  ): Promise<PaginatedContactEnquiries> {
    const qb = this.enquiriesRepository.createQueryBuilder('e').orderBy('e.createdAt', 'DESC');

    if (status) qb.andWhere('e.status = :status', { status });

    if (search) {
      qb.andWhere(
        '(LOWER(e.name) LIKE LOWER(:search) OR LOWER(e.email) LIKE LOWER(:search) OR e.phone LIKE :search OR LOWER(e.subject) LIKE LOWER(:search))',
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

  private async getStatusCounts(): Promise<Record<ContactEnquiryStatus, number>> {
    const rows = await this.enquiriesRepository
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.status')
      .getRawMany<{ status: ContactEnquiryStatus; count: string }>();

    const counts = Object.fromEntries(
      Object.values(ContactEnquiryStatus).map((s) => [s, 0]),
    ) as Record<ContactEnquiryStatus, number>;
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async findOne(id: string) {
    const enquiry = await this.enquiriesRepository.findOne({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    return enquiry;
  }

  async update(id: string, dto: UpdateContactEnquiryDto) {
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
