import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profile/entities/company-profile.entity';
import { Product } from '../products/entities/product.entity';
import { SalesRepEnquiry } from './entities/sales-rep-enquiry.entity';
import { SalesRepEnquiriesController } from './sales-rep-enquiries.controller';
import { SalesRepEnquiriesService } from './sales-rep-enquiries.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesRepEnquiry, Product, CompanyProfile]),
  ],
  controllers: [SalesRepEnquiriesController],
  providers: [SalesRepEnquiriesService],
})
export class SalesRepEnquiriesModule {}
