import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SalesRepEnquiryStatus } from '../../../common/enums/sales-rep-enquiry-status.enum';

export class UpdateSalesRepEnquiryDto {
  @ApiPropertyOptional({ enum: SalesRepEnquiryStatus })
  @IsOptional()
  @IsEnum(SalesRepEnquiryStatus)
  status?: SalesRepEnquiryStatus;

  @ApiPropertyOptional({
    description: 'Internal notes, not shown to the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  adminNotes?: string;
}
