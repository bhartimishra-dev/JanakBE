import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateSalesRepEnquiryDto {
  @ApiProperty({
    description: 'ID of the product whose sales rep button was clicked',
  })
  @IsUUID()
  productId: string;
}
