import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';
import { ContactEnquiry } from './entities/contact-enquiry.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactEnquiry)
    private enquiriesRepository: Repository<ContactEnquiry>,
  ) {}

  async create(dto: CreateContactEnquiryDto) {
    const enquiry = this.enquiriesRepository.create({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone ?? null,
      subject: dto.subject?.trim() || null,
      message: dto.message.trim(),
    });
    await this.enquiriesRepository.save(enquiry);
    return {
      message:
        'Thank you for reaching out. Our team will get back to you shortly.',
    };
  }
}
