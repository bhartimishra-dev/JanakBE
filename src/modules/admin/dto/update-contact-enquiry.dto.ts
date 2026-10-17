import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContactEnquiryStatus } from '../../../common/enums/contact-enquiry-status.enum';

export class UpdateContactEnquiryDto {
  @ApiPropertyOptional({ enum: ContactEnquiryStatus })
  @IsOptional()
  @IsEnum(ContactEnquiryStatus)
  status?: ContactEnquiryStatus;

  @ApiPropertyOptional({ description: 'Internal notes, not shown to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  adminNotes?: string;
}
